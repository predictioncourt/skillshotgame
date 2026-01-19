// ================== CONFIG ==================
let qCooldown = 350;
let lastQTime = 0;
let lockedCount = 0;
const MAX_LOCKED = 10;
let gameStartTime = 0;
let elapsedTime = 0;
let gameStarted = false;
const LEADERBOARD_MAX = 10;

// ================== ANTICHEAT SYSTEM (CLOSURE - CONSOLE'DAN ERIŞILEMEZ) ==================
const AntiCheatSystem = (() => {
  // Tüm anticheat değişkenleri closure içinde SAKLI
  let cheatFlags = 0;
  const MAX_CHEAT_FLAGS = 5;
  const CHEAT_DETECTION = {
    shoot_spam: 0,
    speed_exploit: 0,
    score_manipulation: 0,
    position_exploit: 0,
    behavior_anomaly: 0,
    storage_tampering: 0
  };
  
  let lastLockedCount = 0;
  let lastQSpamTime = [];
  const Q_SPAM_THRESHOLD = 3;
  const Q_SPAM_WINDOW = 500;
  let totalShotsAttempted = 0;
  let totalHits = 0;
  let gameSessionId = Math.random().toString(36).substr(2, 9);
  let scoreChangeCounter = 0;
  
  // Simple hash function (console bypass'i zorlaştırır)
  function hashValue(val) {
    const str = String(val);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
  
  // Flag ekleme (dışarıdan doğrudan erişim olanaksız)
  function addFlag(type) {
    cheatFlags++;
    CHEAT_DETECTION[type]++;
    console.warn(`[ANTICHEAT] ${type} detected (Flags: ${cheatFlags}/${MAX_CHEAT_FLAGS})`);
  }
  
  // Q Spam kontrolü
  function checkQSpam() {
    const currentTime = Date.now();
    lastQSpamTime.push(currentTime);
    lastQSpamTime = lastQSpamTime.filter(t => currentTime - t < Q_SPAM_WINDOW);
    
    if (lastQSpamTime.length > Q_SPAM_THRESHOLD) {
      addFlag('shoot_spam');
      return false;
    }
    return true;
  }
  
  // Speed exploit kontrolü
  function checkSpeedExploit(velocity) {
    // ❌ REMOVED: Bu kontrol matematiksel olarak işe yaramıyor
    // vel = Math.hypot(Math.cos(angle) * 12, Math.sin(angle) * 12)
    // bu her zaman ≈ 12 döner, threshold kontrolü anlamsız
    return true;
  }
  
  // Score integrity kontrolü (GERÇEK LOGIC - önceki skorla karşılaştırma)
  function checkScoreIntegrity(currentScore) {
    // Anormal artış kontrolü
    const scoreDiff = currentScore - lastLockedCount;
    
    // 2 ve üzeri frame'de maksimum 1 skor artışı normal
    // Iki enemy aynı frame'de lock olması çok nadir (false negative riski minimized)
    if (scoreDiff > 2) {
      scoreChangeCounter++;
      // İkinci kez ard arda >2 artış = kesinlikle şüpheli
      if (scoreChangeCounter >= 2) {
        addFlag('score_manipulation');
        scoreChangeCounter = 0;
        return false;
      }
    } else {
      scoreChangeCounter = 0; // Reset
    }
    
    lastLockedCount = currentScore;
    return true;
  }
  
  // Position validation (canvas resize vs. untuk tolerance eklendi)
  function checkPositionExploit(playerX, playerY, canvasWidth, canvasHeight) {
    const TOLERANCE = 20; // Canvas resize için büyük margin
    const expectedX = canvasWidth / 2;
    const expectedY = canvasHeight / 2;
    
    if (Math.abs(playerX - expectedX) > TOLERANCE || 
        Math.abs(playerY - expectedY) > TOLERANCE) {
      addFlag('position_exploit');
      return false;
    }
    return true;
  }
  
  // Accuracy anomaly kontrolü
  function checkAccuracyAnomaly() {
    // ❌ REMOVED: Dodge sistemi yüzünden false positive riski
    // Oyunun competitive olmayan doğası sebebiyle bu kontrol gereksiz
    // Casual oyuncuyu yersiz yere banlamak istemiyoruz
    return true;
  }
  
  // Leaderboard integrity (sadece data validation, exploit engelleme değil)
  function validateLeaderboardIntegrity(leaderboardData) {
    try {
      if (!Array.isArray(leaderboardData) || leaderboardData.length === 0) {
        return true; // Boş leaderboard sorun değil
      }
      
      // Her entry geçerli sayı mı? (0-3600 saniye = 0-60 dakika)
      for (let entry of leaderboardData) {
        if (typeof entry !== 'number' || entry < 0 || entry > 3600) {
          addFlag('storage_tampering');
          return false;
        }
      }
      
      // Sıralama kontrolü (descending olmalı - en yüksek süre önce)
      for (let i = 1; i < leaderboardData.length; i++) {
        if (leaderboardData[i] > leaderboardData[i-1]) {
          addFlag('storage_tampering');
          return false;
        }
      }
      
      return true;
    } catch (e) {
      addFlag('storage_tampering');
      return false;
    }
  }
  
  // Public API
  return {
    checkQSpam: checkQSpam,
    checkSpeedExploit: checkSpeedExploit,
    checkScoreIntegrity: checkScoreIntegrity,
    checkPositionExploit: checkPositionExploit,
    checkAccuracyAnomaly: checkAccuracyAnomaly,
    validateLeaderboardIntegrity: validateLeaderboardIntegrity,
    isTriggered: () => cheatFlags >= MAX_CHEAT_FLAGS,
    getFlagCount: () => cheatFlags,
    reset: () => {
      cheatFlags = 0;
      CHEAT_DETECTION.shoot_spam = 0;
      CHEAT_DETECTION.speed_exploit = 0;
      CHEAT_DETECTION.score_manipulation = 0;
      CHEAT_DETECTION.position_exploit = 0;
      CHEAT_DETECTION.behavior_anomaly = 0;
      CHEAT_DETECTION.storage_tampering = 0;
      lastLockedCount = 0;
      lastQSpamTime = [];
      scoreChangeCounter = 0;
      gameSessionId = Math.random().toString(36).substr(2, 9);
    }
  };
})();

// ================== CANVAS ==================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

// ================== PLAYER ==================
const player = {
  x: () => canvas.width / 2,
  y: () => canvas.height / 2,
  r: 10
};

// ================== LEADERBOARD ==================
function getLeaderboard() {
  const now = Date.now();
  const lastResetTime = localStorage.getItem('leaderboardResetTime');
  const RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24 saat
  
  // Eğer 24 saat geçtiyse reset et
  if (lastResetTime && (now - parseInt(lastResetTime)) > RESET_INTERVAL) {
    localStorage.removeItem('skillshotLeaderboard');
    localStorage.setItem('leaderboardResetTime', now.toString());
    return [];
  }
  
  // İlk kez ise reset zamanını kaydet
  if (!lastResetTime) {
    localStorage.setItem('leaderboardResetTime', now.toString());
  }
  
  const data = localStorage.getItem('skillshotLeaderboard');
  return data ? JSON.parse(data) : [];
}

function saveLeaderboard(leaderboard) {
  localStorage.setItem('skillshotLeaderboard', JSON.stringify(leaderboard));
}

function addScore(seconds) {
  let leaderboard = getLeaderboard();
  leaderboard.push(seconds);
  leaderboard.sort((a, b) => b - a); // En uzun süreler önce (azalan sıra)
  leaderboard = leaderboard.slice(0, LEADERBOARD_MAX);
  saveLeaderboard(leaderboard);
  updateLeaderboardDisplay();
}

function updateLeaderboardDisplay() {
  const leaderboard = getLeaderboard();
  const listDiv = document.getElementById('leaderboardList');
  
  if (leaderboard.length === 0) {
    listDiv.innerHTML = '<p class="no-records">Henüz rekor yok...</p>';
    return;
  }
  
  listDiv.innerHTML = leaderboard.map((seconds, index) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `
      <div class="leaderboard-item">
        <span class="leaderboard-rank">#${index + 1}</span>
        <span class="leaderboard-time">${timeStr}</span>
      </div>
    `;
  }).join('');
}

// ================== GAME LOGIC ==================
let mouse = { x: 0, y: 0 };
canvas.addEventListener("mousemove", e => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});

// ================== SHOTS ==================
let shots = [];

document.addEventListener("keydown", e => {
  if (e.key.toLowerCase() === "q") {
    const now = performance.now();
    if (now - lastQTime >= qCooldown) {
      // ========== ANTICHEAT: Q SPAM CHECK ==========
      if (!AntiCheatSystem.checkQSpam()) {
        lastQTime = now;
        return;
      }
      
      shoot();
      lastQTime = now;
    }
  }
});

function shoot() {
  const angle = Math.atan2(mouse.y - player.y(), mouse.x - player.x());
  const vel = Math.hypot(Math.cos(angle) * 12, Math.sin(angle) * 12);
  
  // ========== ANTICHEAT: SPEED EXPLOIT CHECK ==========
  if (!AntiCheatSystem.checkSpeedExploit(vel)) {
    return; // Atışı iptal et
  }
  
  shots.push({
    x: player.x(),
    y: player.y(),
    dx: Math.cos(angle) * 12,
    dy: Math.sin(angle) * 12,
    life: 60
  });
}

// ================== ENEMIES ==================
let enemies = [];

function spawnEnemy() {
  // 4 yönden spawn: sol, sağ, üst, alt
  const spawnSide = Math.floor(Math.random() * 4);
  let x, y, dx, dy;
  
  if (spawnSide === 0) {
    // Soldan
    x = -30;
    y = Math.random() * canvas.height;
    dx = 1;
    dy = 0;
  } else if (spawnSide === 1) {
    // Sağdan
    x = canvas.width + 30;
    y = Math.random() * canvas.height;
    dx = -1;
    dy = 0;
  } else if (spawnSide === 2) {
    // Üstünden
    x = Math.random() * canvas.width;
    y = -30;
    dx = 0;
    dy = 1;
  } else {
    // Altından
    x = Math.random() * canvas.width;
    y = canvas.height + 30;
    dx = 0;
    dy = -1;
  }
  
  const hasAIDodge = Math.random() < 0.5; // %50 dodge yeteneği
  
  enemies.push({
    x: x,
    y: y,
    r: 8 + Math.random() * 3,
    speed: 0.6 + Math.random() * 0.4,
    locked: false,
    spawnDx: dx,
    spawnDy: dy,
    hasAIDodge: hasAIDodge,
    dodgeTimer: 0,
    dodgeDirection: 0,
    dodgeAxis: dx !== 0 ? 'y' : 'x', // X ekseni geliyorsa Y eksende dodge, Y ekseni geliyorsa X eksende dodge
    dodgeCooldown: 0,
    dodgeChance: 0.10 + Math.random() * 0.03, // %10-13 şansa dodge başlat
    dodgeIntensity: 0.7 + Math.random() * 0.35 // Minimal daha etkili (0.7-1.05x)
  });
}

let spawnInterval = null;

function startSpawning() {
  // Var olan interval varsa temizle (restart sırasında)
  if (spawnInterval !== null) {
    clearInterval(spawnInterval);
  }
  spawnInterval = setInterval(spawnEnemy, 1300);
}

// ================== GAME LOOP ==================
let gameOver = false;

function resetGame() {
  gameOver = false;
  lockedCount = 0;
  enemies = [];
  shots = [];
  gameStartTime = 0;
  elapsedTime = 0;
  
  // Spawn interval'ı temizle
  if (spawnInterval !== null) {
    clearInterval(spawnInterval);
    spawnInterval = null;
  }
  
  document.getElementById("tutorial").classList.remove("hidden");
  document.getElementById("gameOverButtons").classList.add("hidden");
  document.getElementById("timer").textContent = "00:00";
}

function update() {
  if (gameOver) return;
  if (!gameStarted) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // -------- TIMER --------
  if (gameStartTime === 0) {
    gameStartTime = performance.now();
  }
  elapsedTime = Math.floor((performance.now() - gameStartTime) / 1000);
  const minutes = Math.floor(elapsedTime / 60);
  const seconds = elapsedTime % 60;
  const timeString = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  document.getElementById("timer").textContent = timeString;

  // -------- PLAYER --------
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(player.x(), player.y(), player.r, 0, Math.PI * 2);
  ctx.fill();

  // -------- SHOTS --------
  shots.forEach((s, i) => {
    s.x += s.dx;
    s.y += s.dy;
    s.life--;

    ctx.strokeStyle = "cyan";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - s.dx, s.y - s.dy);
    ctx.stroke();

    if (s.life <= 0) shots.splice(i, 1);
  });

  // -------- ENEMIES --------
  enemies.forEach((e, ei) => {
    if (!e.locked) {
      // X hareketi (player'a doğru veya spawn yönüne)
      if (e.spawnDx !== 0) {
        if (Math.abs(e.x - player.x()) > 2) {
          e.x += e.x < player.x() ? e.speed : -e.speed;
        } else {
          e.locked = true;
          lockedCount++;
        }
      }
      
      // Y hareketi (player'a doğru veya spawn yönüne)
      if (e.spawnDy !== 0) {
        if (Math.abs(e.y - player.y()) > 2) {
          e.y += e.y < player.y() ? e.speed : -e.speed;
        } else {
          e.locked = true;
          lockedCount++;
        }
      }
      
      // AI Dodge Mekaniklerine - Mermiyi algıla ve etkili kaç
      if (e.hasAIDodge) {
        e.dodgeCooldown--;
        
        // Yaklaşan mermiyi algıla
        let shouldDodge = false;
        shots.forEach(s => {
          const dx = s.x - e.x;
          const dy = s.y - e.y;
          const dist = Math.hypot(dx, dy);
          
          // Mermi 120 pikselden yakınsa ve bize doğru geliyorsa
          if (dist < 120) {
            const sVelMag = Math.hypot(s.dx, s.dy);
            const dotProduct = (dx * s.dx + dy * s.dy) / (dist * sVelMag);
            
            // Mermi bize yaklaşıyorsa ve nadir ama etkili dodge şansı
            if (dotProduct > 0.2 && e.dodgeCooldown <= 0 && Math.random() < e.dodgeChance) {
              shouldDodge = true;
            }
          }
        });
        
        // Dodge başlat - etkili ve hızlı
        if (shouldDodge) {
          if (e.dodgeAxis === 'y') {
            // Yataydan gelen daireler = Y ekseninde dodge (yukarı/aşağı)
            e.dodgeDirection = Math.random() < 0.5 ? -1 : 1;
          } else {
            // Düzeyden gelen daireler = X ekseninde dodge (sağa/sola)
            e.dodgeDirection = Math.random() < 0.5 ? -1 : 1;
          }
          e.dodgeTimer = 15; // Dodge süresi
          e.dodgeCooldown = 35; // Cooldown
        }
        
        // Dodge bitir
        e.dodgeTimer--;
        if (e.dodgeTimer <= 0) {
          e.dodgeDirection = 0;
        }
        
        // Dodge hareketi uygula - hafif ve uyumlu
        if (e.dodgeDirection !== 0) {
          if (e.dodgeAxis === 'y') {
            // Y ekseninde dodge
            e.y += e.dodgeDirection * e.speed * 0.8 * e.dodgeIntensity;
          } else {
            // X ekseninde dodge
            e.x += e.dodgeDirection * e.speed * 0.8 * e.dodgeIntensity;
          }
          
          // ========== BOUNDARY CHECK AFTER DODGE ==========
          e.x = Math.max(e.r, Math.min(canvas.width - e.r, e.x));
          e.y = Math.max(e.r, Math.min(canvas.height - e.r, e.y));
        }
      }
      
      // Boundary check - daireler ekrandan çıkmasın (tüm hareketler sonrası)
      e.x = Math.max(e.r, Math.min(canvas.width - e.r, e.x));
      e.y = Math.max(e.r, Math.min(canvas.height - e.r, e.y));
    }

    ctx.fillStyle = e.locked ? "#550000" : "red";
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();

    // Collision (only if not locked)
    shots.forEach((s, si) => {
      const dx = s.x - e.x;
      const dy = s.y - e.y;
      if (!e.locked && Math.hypot(dx, dy) < e.r) {
        enemies.splice(ei, 1);
        shots.splice(si, 1);
      }
    });
  });

  // -------- UI --------
  ctx.fillStyle = "white";
  ctx.font = "16px Arial";
  ctx.fillText(`MID PRESSURE: ${lockedCount}/${MAX_LOCKED}`, 20, 30);
  
  // ========== ANTICHEAT CHECKS ==========
  AntiCheatSystem.checkScoreIntegrity(lockedCount);
  AntiCheatSystem.checkPositionExploit(player.x(), player.y(), canvas.width, canvas.height);
  
  // Leaderboard integrity kontrolü
  const savedLeaderboard = localStorage.getItem('skillshotLeaderboard');
  if (savedLeaderboard) {
    try {
      const lb = JSON.parse(savedLeaderboard);
      AntiCheatSystem.validateLeaderboardIntegrity(lb);
    } catch (e) {
      console.warn("[ANTICHEAT] Corrupted leaderboard data");
    }
  }
  
  // ========== ANTICHEAT TRIGGERED CHECK ==========
  if (AntiCheatSystem.isTriggered()) {
    gameOver = true;
    ctx.fillStyle = "rgba(255, 0, 0, 0.8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "yellow";
    ctx.font = "bold 48px Arial";
    ctx.fillText("ANTICHEAT TRIGGERED", canvas.width / 2 - 280, canvas.height / 2 - 30);
    ctx.font = "24px Arial";
    ctx.fillText("Hile yapıldığı tespit edildi!", canvas.width / 2 - 150, canvas.height / 2 + 40);
    return;
  }

  // -------- GAME OVER --------
  if (lockedCount >= MAX_LOCKED) {
    gameOver = true;
    addScore(elapsedTime);
    ctx.fillStyle = "red";
    ctx.font = "48px Arial";
    ctx.fillText("GAME OVER", canvas.width / 2 - 140, canvas.height / 2);
    
    document.getElementById("gameOverButtons").classList.remove("hidden");
    return;
  }

  requestAnimationFrame(update);
}

function resetGame() {
  gameOver = false;
  gameStarted = false;
  lockedCount = 0;
  enemies = [];
  shots = [];
  gameStartTime = 0;
  elapsedTime = 0;
  
  // Spawn interval'ı temizle
  if (spawnInterval !== null) {
    clearInterval(spawnInterval);
    spawnInterval = null;
  }
  
  // ========== ANTICHEAT RESET ==========
  AntiCheatSystem.reset();
  
  document.getElementById("tutorial").classList.remove("hidden");
  document.getElementById("gameOverButtons").classList.add("hidden");
  document.getElementById("timer").textContent = "00:00";
}

function restartGame() {
  gameOver = false;
  lockedCount = 0;
  enemies = [];
  shots = [];
  gameStartTime = 0;
  elapsedTime = 0;
  
  // ========== ANTICHEAT RESET ==========
  AntiCheatSystem.reset();
  
  document.getElementById("gameOverButtons").classList.add("hidden");
  document.getElementById("timer").textContent = "00:00";
  
  // Oyunu başlat ve spawn'ı başlat
  startSpawning();
  update();
}

// ================== EVENT LISTENERS ==================
document.getElementById("startBtn").addEventListener("click", () => {
  document.getElementById("tutorial").classList.add("hidden");
  gameStarted = true;
  startSpawning(); // Spawn'ı başlat
  update();
});

document.getElementById("menuBtn").addEventListener("click", () => {
  resetGame();
});

document.getElementById("restartBtn").addEventListener("click", () => {
  restartGame();
});

// ================== INITIALIZE ==================
updateLeaderboardDisplay();