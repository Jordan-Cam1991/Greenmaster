/**
 * Main Application Controller for GreenMaster AI
 * Featuring "Blade" — Your Friendly Pocket Lawn Pal & Mascot!
 * Supports Multi-Zone Segments (Front/Back/Side), Custom Gear Entry, and Initial Onboarding Photos.
 */
const App = {
  activeTab: 'dashboard',
  activeHorizon: 'oneWeek',
  activeZoneId: 'all',
  currentPlan: null,
  profile: null,
  weather: null,
  isScanning: false,

  // Onboarding wizard state
  onboardingStep: 1,
  totalOnboardingSteps: 6,
  consultationData: {
    pathway: 'existing',
    tier: 'full_pro',
    grassType: 'Bermuda / Couch',
    hoc: 12,
    zones: [
      { id: 'front', name: 'Front Yard', grassType: 'Bermuda / Couch', hoc: 12, area: 120, sunExposure: 'Full Sun (6+ hrs)' },
      { id: 'back', name: 'Back Yard', grassType: 'Buffalo / St Augustine', hoc: 35, area: 130, sunExposure: 'Partial Shade (3-5 hrs)' }
    ],
    mowerType: 'Cylinder / Reel Mower',
    equipment: ['Cylinder / Reel Mower', 'Battery Backpack Sprayer'],
    lastMowDays: 3,
    lastFertType: 'Liquid Foliar',
    lastFertDays: 14,
    preEmergentStatus: 'none',
    lastRenovation: 'last_year',
    sprinklers: 'In-Ground MP Rotators',
    wateringFreq: '2 times/week',
    initialPhotoData: null,
    customOwnedProducts: []
  },

  bladeDialogues: [
    "G'day! I'm <strong>Blade</strong>, your pocket lawn pal! 🌱 Before we dive into the app, let's have a quick chat about your lawn so I can help you achieve all your green dreams! Where are we starting from today?",
    "Awesome! Let's map your lawn segments. Front yards, backyards, and side passages often have different grass or shade levels!",
    "Love that! Let's check your shed. What mower and gear do you have ready to roll?",
    "To make your plan super accurate, tell me: when did your grass last get a haircut or some lawn food?",
    "Would you like to snap a quick photo of your turf right now so I can inspect its health and density? 📸 (Or skip and do this later!)",
    "You're an absolute legend! Here's my diagnosis and recommended gear. If you already have some of these, just let me know what you use!"
  ],

  async init() {
    this.profile = StorageManager.getProfile();
    this.currentPlan = StorageManager.getActivePlan();
    this.activeZoneId = StorageManager.getActiveZoneId();

    if (!this.currentPlan) {
      const initialMetrics = {
        densityPercent: 84,
        avgDgci: 80,
        weedRatio: 0.01,
        brownRatio: 0.03,
        healthScore: 86
      };
      const initialPlan = PlannerEngine.generateDynamicPlan({
        cvMetrics: initialMetrics,
        weedLevel: 'Low (<2%)',
        weeds: ['Clover spot'],
        diseaseOrStress: 'Healthy vigor',
        profile: this.profile,
        zones: StorageManager.getZones()
      });
      this.currentPlan = {
        date: new Date().toISOString(),
        healthScore: 86,
        darkGreenColorIndex: 80,
        densityScore: 84,
        weedPressure: 'Low (<2%)',
        weedsDetected: ['Clover spot'],
        diseaseOrStress: 'Healthy active stolon growth',
        overallVerdict: 'Baseline plan generated based on your equipment and desired maintenance standard.',
        actionPlan: initialPlan
      };
      StorageManager.saveActivePlan(this.currentPlan);
    }

    this.bindEvents();
    this.renderAll();
    this.registerServiceWorker();

    // Check onboarding
    if (!StorageManager.isOnboarded()) {
      this.showOnboarding(true);
    }

    // Load live weather
    this.fetchWeather();
  },

  async fetchWeather() {
    try {
      this.weather = await WeatherEngine.getCurrentWeather();
      this.renderDashboardWeather();
    } catch (e) {
      console.warn('Weather load issue:', e);
    }
  },

  bindEvents() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    document.querySelectorAll('[data-horizon]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const horizon = e.currentTarget.getAttribute('data-horizon');
        this.switchHorizon(horizon);
      });
    });

    // Zone switcher pills
    this.bindZoneEvents();

    const photoInput = document.getElementById('lawn-photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', (e) => this.handlePhotoSelected(e));
    }

    // Onboarding photo input
    const obPhotoInput = document.getElementById('ob-photo-input');
    if (obPhotoInput) {
      obPhotoInput.addEventListener('change', (e) => this.handleOnboardingPhotoSelected(e));
    }

    const dropZone = document.getElementById('photo-dropzone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('border-emerald-500', 'bg-emerald-50');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('border-emerald-500', 'bg-emerald-50');
      });
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-emerald-500', 'bg-emerald-50');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.processImageFile(e.dataTransfer.files[0]);
        }
      });
    }

    document.querySelectorAll('[data-demo-turf]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.currentTarget.getAttribute('data-demo-turf');
        this.loadDemoTurf(type);
      });
    });

    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('change', () => this.handleProfileChange());
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleProfileChange();
        this.showToast('Lawn Profile Updated! Action Plan Recalibrated.');
      });
    }

    const calBtn = document.getElementById('export-calendar-btn');
    if (calBtn) {
      calBtn.addEventListener('click', () => {
        NotificationManager.exportPlanToCalendar(this.currentPlan);
        this.showToast('iCalendar (.ics) downloaded! Sync with Apple/Google Calendar.');
      });
    }

    const notifBtn = document.getElementById('enable-notifications-btn');
    if (notifBtn) {
      notifBtn.addEventListener('click', async () => {
        const granted = await NotificationManager.requestPermission();
        if (granted) {
          NotificationManager.showNotification('GreenMaster AI Active', 'Blade is ready to remind you of your cuts & feeds! 🌱');
          this.showToast('Push Notifications Enabled!');
          this.renderNotificationStatus();
        } else {
          this.showToast('Notification permission was denied.');
        }
      });
    }

    const testNotifBtn = document.getElementById('test-notification-btn');
    if (testNotifBtn) {
      testNotifBtn.addEventListener('click', () => {
        NotificationManager.showNotification('🌱 Blade: Lawn Time!', 'Time for your weekly photo scan & cylinder reel mow!');
        NotificationManager.playTone();
        this.showToast('Notification sent & chime played!');
      });
    }
  },

  bindZoneEvents() {
    const container = document.getElementById('dash-zone-selector');
    if (!container) return;
    container.querySelectorAll('[data-zone-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-zone-id');
        this.switchZone(id);
      });
    });
  },

  switchZone(zoneId) {
    this.activeZoneId = zoneId;
    StorageManager.setActiveZoneId(zoneId);
    this.renderZoneBar();
    this.renderDashboard();
    this.renderTasksList();
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.add('hidden');
    });
    const target = document.getElementById(`view-${tab}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('[data-tab]').forEach(btn => {
      const active = btn.getAttribute('data-tab') === tab;
      if (tab !== 'vision') {
        btn.classList.toggle('text-emerald-600', active);
        btn.classList.toggle('text-slate-400', !active);
      }
    });

    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  switchHorizon(horizon) {
    this.activeHorizon = horizon;
    document.querySelectorAll('[data-horizon]').forEach(btn => {
      const active = btn.getAttribute('data-horizon') === horizon;
      btn.classList.toggle('active', active);
      btn.classList.toggle('bg-emerald-600', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('bg-slate-100', !active);
      btn.classList.toggle('text-slate-700', !active);
    });
    this.renderTasksList();
  },

  renderAll() {
    this.renderHeader();
    this.renderZoneBar();
    this.renderDashboard();
    this.renderTasksList();
    this.renderProfileForm();
    this.renderNotificationStatus();
    this.renderHistory();
    this.renderAnalytics();
    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  renderHeader() {
    const scoreEl = document.getElementById('header-health-score');
    const tierBadge = document.getElementById('header-tier-badge');
    const lawnNameEl = document.getElementById('header-lawn-name');

    if (scoreEl && this.currentPlan) {
      scoreEl.innerText = `${this.currentPlan.healthScore || 85}%`;
    }
    if (lawnNameEl) {
      lawnNameEl.innerText = this.profile.lawnName || 'My Turf';
    }
    if (tierBadge) {
      const tierMap = {
        'low_maintenance': { label: 'Weekend Warrior', cls: 'badge-low' },
        'semi_pro': { label: 'Semi-Pro Enthusiast', cls: 'badge-semi' },
        'full_pro': { label: 'Golf / Bowling Green Pro', cls: 'badge-pro' }
      };
      const info = tierMap[this.profile.tier] || tierMap['semi_pro'];
      tierBadge.innerText = info.label;
      tierBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-semibold ${info.cls}`;
    }
  },

  renderZoneBar() {
    const container = document.getElementById('dash-zone-selector');
    if (!container) return;
    const zones = StorageManager.getZones();

    container.innerHTML = `
      <button data-zone-id="all" class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${this.activeZoneId === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        🌿 All Turf (${this.profile.lawnArea}m²)
      </button>
      ${zones.map(z => `
        <button data-zone-id="${z.id}" class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${this.activeZoneId === z.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
          ${z.name.includes('Front') ? '🏡' : z.name.includes('Back') ? '🌳' : '📐'} ${z.name} (${z.hoc}mm)
        </button>
      `).join('')}
      <button onclick="App.promptAddZone()" class="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1">
        <span>+ Add Zone</span>
      </button>
    `;

    this.bindZoneEvents();
  },

  promptAddZone() {
    const name = prompt('Zone Name (e.g. Side Passage, Nature Strip):', 'Side Yard');
    if (!name) return;
    const hoc = prompt('Target Cut Height (HOC in mm):', '20');
    const sun = prompt('Sun Exposure (Full Sun / Partial Shade / Heavy Shade):', 'Partial Shade');
    StorageManager.addZone({
      name,
      hoc: Number(hoc) || 20,
      area: 40,
      sunExposure: sun || 'Partial Shade'
    });
    this.handleProfileChange();
    this.showToast(`Zone "${name}" added!`);
  },

  renderDashboard() {
    const logs = StorageManager.getLogs();
    const activeZone = StorageManager.getActiveZone();

    // 1. Last Mow relative text
    const lastMowEl = document.getElementById('dash-last-mow-text');
    if (lastMowEl && logs.lastMow) {
      lastMowEl.innerText = this.formatRelativeTime(logs.lastMow);
    }

    // 2. Next Action from Planner
    const nextActionEl = document.getElementById('dash-next-action-text');
    const nextActionSubEl = document.getElementById('dash-next-action-sub');
    const nextActionCatEl = document.getElementById('dash-next-action-cat');
    const weekTasks = this.currentPlan?.actionPlan?.oneWeek || [];
    const completedTasks = StorageManager.getCompletedTasks();
    const nextPendingTask = weekTasks.find(t => !completedTasks[`oneWeek_${t.id || 0}`]) || weekTasks[0];

    if (nextPendingTask) {
      if (nextActionEl) nextActionEl.innerText = nextPendingTask.task;
      if (nextActionSubEl) nextActionSubEl.innerText = nextPendingTask.tip ? `Tip: ${nextPendingTask.tip.slice(0, 80)}...` : 'Next on your weekly schedule';
      if (nextActionCatEl) nextActionCatEl.innerText = `${nextPendingTask.category} • ${nextPendingTask.urgency} Urgency`;
    }

    // 3. Fertiliser & Nutrition Level
    const fertStatusEl = document.getElementById('dash-fert-status');
    const fertSubEl = document.getElementById('dash-fert-sub');
    if (fertStatusEl && logs.lastFeed) {
      fertStatusEl.innerText = `Fed ${this.formatRelativeTime(logs.lastFeed)}`;
      if (fertSubEl) fertSubEl.innerText = `Pre-emergent barrier: ${logs.preEmergentActiveDays || 38} days active`;
    }

    // 4. Watering & Sprinkler Status
    const waterStatusEl = document.getElementById('dash-water-status');
    if (waterStatusEl && logs.lastWater) {
      waterStatusEl.innerText = `Watered ${this.formatRelativeTime(logs.lastWater)}`;
    }

    // 5. Height of Cut Target (Filtered by zone if selected)
    const hocTextEl = document.getElementById('dash-hoc-text');
    const hocSubEl = document.getElementById('dash-hoc-sub');
    if (hocTextEl) {
      const hocVal = activeZone ? activeZone.hoc : this.profile.hoc;
      hocTextEl.innerText = `${hocVal}mm (${(hocVal / 25.4).toFixed(2)}")`;
      if (hocSubEl) {
        hocSubEl.innerText = activeZone ? `${activeZone.name} • ${activeZone.sunExposure}` : 'Bowling green standard';
      }
    }

    // 6. Blade Mascot Tip of the Day
    const mascotTipEl = document.getElementById('dash-mascot-tip');
    if (mascotTipEl) {
      if (activeZone && activeZone.sunExposure.includes('Shade')) {
        mascotTipEl.innerText = `Blade says: "${activeZone.name} gets less sunlight! Keep cut height around ${activeZone.hoc}mm so the leaf blades capture enough energy! ⛅"`;
      } else {
        const tips = [
          "Looking sharp! Remember the 1/3rd cut rule: never take off more than a third in one go to keep my root system deep and strong! ✂️",
          "If you want that dark tournament emerald pop without exploding growth, liquid spoon-feed iron + nitrogen! 🧪",
          "A sharp reel or rotary blade stops frayed yellow leaf tips and keeps me disease-free! 💎",
          "Deep watering at dawn forces my roots to dig deep into the earth! 💧"
        ];
        mascotTipEl.innerText = tips[Math.floor(Math.random() * tips.length)];
      }
    }

    this.renderDashboardWeather();
  },

  renderDashboardWeather() {
    if (!this.weather) return;

    const banner = document.getElementById('dash-rain-alert-banner');
    const verdictEl = document.getElementById('dash-rain-verdict');
    const tempEl = document.getElementById('dash-weather-temp');
    const rainProbEl = document.getElementById('dash-weather-prob');

    if (tempEl) tempEl.innerText = `${this.weather.currentTemp}°C`;
    if (rainProbEl) rainProbEl.innerText = `${this.weather.maxProb}% Rain Risk`;

    if (banner && verdictEl) {
      verdictEl.innerText = this.weather.rainVerdict;
      if (this.weather.shouldSkipSprinklers) {
        banner.className = 'p-4 rounded-3xl bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-lg shadow-sky-600/20 border border-sky-400/30 flex items-start gap-3';
      } else {
        banner.className = 'p-3 rounded-2xl bg-emerald-50 text-emerald-900 border border-emerald-200/80 flex items-center gap-2.5';
      }
    }

    const weatherSummaryEl = document.getElementById('weather-summary-text');
    if (weatherSummaryEl) {
      weatherSummaryEl.innerText = this.weather.rainVerdict;
    }
  },

  formatRelativeTime(isoString) {
    if (!isoString) return 'Not yet logged';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },

  logQuickMow() {
    StorageManager.logMow();
    NotificationManager.playTone();
    this.renderDashboard();
    this.showToast('✂️ Nice cut! Blade loves a fresh haircut.');
  },

  logQuickWater() {
    StorageManager.logWater();
    NotificationManager.playTone();
    this.renderDashboard();
    this.showToast('💧 Ahh, refreshing! Irrigation cycle logged.');
  },

  logQuickFeed() {
    StorageManager.logFeed('Foliar Spoon-feed');
    NotificationManager.playTone();
    this.renderDashboard();
    this.showToast('🧪 Delicious! Fertiliser application logged.');
  },

  renderTasksList() {
    const container = document.getElementById('tasks-container');
    if (!container || !this.currentPlan || !this.currentPlan.actionPlan) return;

    const horizonMap = {
      oneWeek: { label: 'Next Week (7 Days)', sub: 'Immediate precision tasks' },
      twoWeeks: { label: 'Two Weeks (14 Days)', sub: 'Short-term feeding & turf grooming' },
      oneMonth: { label: 'One Month (30 Days)', sub: 'Soil conditioning & equipment maintenance' },
      oneQuarter: { label: 'One Quarter (3 Months)', sub: 'Seasonal barrier & levelling' },
      halfYear: { label: 'Half Year (6 Months)', sub: 'Mid-year aeration & dethatching' },
      oneYear: { label: 'Full Year (12 Months)', sub: 'Master annual renovation & soil test' }
    };

    const currentHorizonInfo = horizonMap[this.activeHorizon];
    const titleEl = document.getElementById('current-horizon-title');
    const subEl = document.getElementById('current-horizon-sub');
    if (titleEl) titleEl.innerText = currentHorizonInfo.label;
    if (subEl) subEl.innerText = currentHorizonInfo.sub;

    const tasks = this.currentPlan.actionPlan[this.activeHorizon] || [];
    const completedTasks = StorageManager.getCompletedTasks();

    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12 text-slate-400">
          <p class="text-sm">No tasks pending for this timeframe. Blade says take a break! ☕</p>
        </div>
      `;
      return;
    }

    const urgencyColors = {
      'Critical': 'bg-rose-100 text-rose-700 border-rose-200',
      'High': 'bg-amber-100 text-amber-800 border-amber-200',
      'Medium': 'bg-emerald-100 text-emerald-800 border-emerald-200',
      'Low': 'bg-slate-100 text-slate-700 border-slate-200'
    };

    const categoryIcons = {
      'Mowing': '✂️',
      'Watering': '💧',
      'Fertiliser': '🧪',
      'Weed Control': '🎯',
      'Soil': '🌱',
      'Renovation': '⚙️',
      'Protection': '🛡️',
      'Equipment': '🔧',
      'Detailing': '📐',
      'Levelling': '⛳'
    };

    let completedCount = 0;

    container.innerHTML = tasks.map((task, idx) => {
      const taskId = `${this.activeHorizon}_${task.id || idx}`;
      const isDone = !!completedTasks[taskId];
      if (isDone) completedCount++;

      const hasShopLink = task.tip && task.tip.includes('lawntips.com');

      return `
        <div class="p-4 rounded-2xl border transition-all ${isDone ? 'bg-slate-50/70 border-slate-200 opacity-60' : 'bg-white border-slate-200 shadow-sm hover:border-emerald-300'}">
          <div class="flex items-start gap-3">
            <input type="checkbox" id="${taskId}" class="task-checkbox mt-1 w-5 h-5 rounded-md text-emerald-600 focus:ring-emerald-500 cursor-pointer" ${isDone ? 'checked' : ''} onchange="App.handleTaskToggle('${taskId}')" />
            <div class="flex-1">
              <div class="flex items-center justify-between gap-2">
                <label for="${taskId}" class="font-medium text-slate-800 text-sm cursor-pointer select-none">
                  ${categoryIcons[task.category] || '🌿'} ${task.task}
                </label>
                <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold border ${urgencyColors[task.urgency] || urgencyColors['Medium']}">
                  ${task.urgency}
                </span>
              </div>
              ${task.tip ? `
                <p class="text-xs text-slate-500 mt-1.5 leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span class="font-semibold text-emerald-700">Blade's Tip:</span> ${task.tip}
                  ${hasShopLink ? `
                    <a href="https://lawntips.com" target="_blank" rel="noopener" class="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 underline bg-emerald-100/60 px-2 py-1 rounded-md">
                      <span>Explore on lawntips.com</span>
                      <i data-lucide="external-link" class="w-3 h-3"></i>
                    </a>
                  ` : ''}
                </p>
              ` : ''}
              <div class="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                <span>Category: <strong>${task.category}</strong></span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const progressEl = document.getElementById('horizon-progress-bar');
    const progressText = document.getElementById('horizon-progress-text');
    const percent = Math.round((completedCount / tasks.length) * 100);
    if (progressEl) progressEl.style.width = `${percent}%`;
    if (progressText) progressText.innerText = `${completedCount} of ${tasks.length} Completed (${percent}%)`;

    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  handleTaskToggle(taskId) {
    const isDone = StorageManager.toggleTaskCompleted(taskId);
    if (isDone) {
      NotificationManager.playTone();
    }
    this.renderTasksList();
    this.renderDashboard();
  },

  handlePhotoSelected(e) {
    if (e.target.files && e.target.files[0]) {
      this.processImageFile(e.target.files[0]);
    }
  },

  handleOnboardingPhotoSelected(e) {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const preview = document.getElementById('ob-photo-preview');
        const statusText = document.getElementById('ob-photo-status');
        if (preview) {
          preview.src = event.target.result;
          preview.classList.remove('hidden');
        }
        if (statusText) statusText.innerText = 'Photo captured! Blade will analyze this during plan generation.';
        this.consultationData.initialPhotoData = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  },

  processImageFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      this.runVisionAnalysis(event.target.result);
    };
    reader.readAsDataURL(file);
  },

  loadDemoTurf(type) {
    const dataUrl = VisionEngine.createDemoTurfImage(type);
    this.runVisionAnalysis(dataUrl);
  },

  async runVisionAnalysis(imageSrc) {
    this.isScanning = true;
    this.showScanningUI(true, imageSrc);

    try {
      const settings = StorageManager.getSettings();
      const result = await VisionEngine.analyzeImage(imageSrc, this.profile, settings.apiKey);

      this.currentPlan = {
        date: new Date().toISOString(),
        ...result
      };
      StorageManager.saveActivePlan(this.currentPlan);

      StorageManager.addScanRecord(result, this.activeZoneId);

      setTimeout(() => {
        this.isScanning = false;
        this.showScanningUI(false);
        this.renderAll();
        this.showScanResultModal(result);
        NotificationManager.playTone();
      }, 1400);

    } catch (e) {
      console.error('Vision analysis error', e);
      this.isScanning = false;
      this.showScanningUI(false);
      this.showToast('Analysis error. Please try another photo.');
    }
  },

  showScanningUI(scanning, imageSrc = '') {
    const preview = document.getElementById('scanner-preview');
    const laser = document.getElementById('scanner-laser');
    const statusText = document.getElementById('scanner-status');
    const scanBtn = document.getElementById('scan-btn-text');

    if (preview && imageSrc) {
      preview.src = imageSrc;
      preview.classList.remove('hidden');
    }
    if (laser) {
      laser.classList.toggle('hidden', !scanning);
    }
    if (statusText) {
      statusText.innerText = scanning ? 'Blade is inspecting your chlorophyll, density & weed patterns...' : 'Ready for photo';
    }
    if (scanBtn) {
      scanBtn.innerText = scanning ? 'Blade Analyzing...' : 'Snap or Upload Lawn Photo';
    }
  },

  showScanResultModal(result) {
    const verdictEl = document.getElementById('modal-verdict');
    const healthEl = document.getElementById('modal-health');
    const densityEl = document.getElementById('modal-density');
    const dgciEl = document.getElementById('modal-dgci');
    const weedEl = document.getElementById('modal-weed');
    const stressEl = document.getElementById('modal-stress');

    if (verdictEl) verdictEl.innerText = result.overallVerdict;
    if (healthEl) healthEl.innerText = `${result.healthScore}%`;
    if (densityEl) densityEl.innerText = `${result.densityScore}%`;
    if (dgciEl) dgciEl.innerText = `${result.darkGreenColorIndex}/100`;
    if (weedEl) weedEl.innerText = result.weedPressure;
    if (stressEl) stressEl.innerText = result.diseaseOrStress;

    const modal = document.getElementById('scan-result-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeModal() {
    const modal = document.getElementById('scan-result-modal');
    if (modal) modal.classList.add('hidden');
    this.switchTab('planner');
  },

  /* ------------------- FRIENDLY MASCOT ONBOARDING WIZARD ------------------- */

  showOnboarding(show = true) {
    const modal = document.getElementById('onboarding-modal');
    if (modal) {
      modal.classList.toggle('hidden', !show);
      if (show) {
        this.onboardingStep = 1;
        this.renderOnboardingStep();
      }
    }
  },

  setPathway(pathway) {
    this.consultationData.pathway = pathway;
    document.querySelectorAll('.pathway-card').forEach(c => {
      c.classList.toggle('border-emerald-500', c.getAttribute('data-pathway') === pathway);
      c.classList.toggle('bg-emerald-50/80', c.getAttribute('data-pathway') === pathway);
    });
  },

  nextOnboardingStep() {
    this.harvestStepData();

    if (this.onboardingStep < this.totalOnboardingSteps) {
      this.onboardingStep++;
      this.renderOnboardingStep();
      NotificationManager.playTone();
    } else {
      this.finishConsultation();
    }
  },

  prevOnboardingStep() {
    if (this.onboardingStep > 1) {
      this.onboardingStep--;
      this.renderOnboardingStep();
    }
  },

  renderOnboardingStep() {
    for (let i = 1; i <= this.totalOnboardingSteps; i++) {
      const stepEl = document.getElementById(`ob-step-${i}`);
      if (stepEl) {
        stepEl.classList.toggle('hidden', i !== this.onboardingStep);
      }
    }

    const bubbleEl = document.getElementById('ob-mascot-speech');
    const progressEl = document.getElementById('ob-progress-bar');
    const backBtn = document.getElementById('ob-back-btn');
    const nextBtn = document.getElementById('ob-next-btn');

    if (progressEl) {
      const pct = Math.round((this.onboardingStep / this.totalOnboardingSteps) * 100);
      progressEl.style.width = `${pct}%`;
    }

    if (backBtn) {
      backBtn.classList.toggle('invisible', this.onboardingStep === 1);
    }

    if (nextBtn) {
      if (this.onboardingStep === 5) {
        nextBtn.innerText = 'Continue to Recommendations →';
      } else if (this.onboardingStep === this.totalOnboardingSteps) {
        nextBtn.innerText = "Let's Grow! →";
      } else {
        nextBtn.innerText = 'Continue →';
      }
    }

    if (bubbleEl) {
      bubbleEl.innerHTML = this.bladeDialogues[this.onboardingStep - 1] || "Let's dial in your lawn!";
    }

    if (this.onboardingStep === 6) {
      this.renderConsultationSummary();
    }

    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  harvestStepData() {
    const step = this.onboardingStep;
    if (step === 2) {
      this.consultationData.tier = document.querySelector('input[name="ob-tier"]:checked')?.value || 'semi_pro';
      this.consultationData.grassType = document.getElementById('ob-grass-type')?.value || 'Bermuda / Couch';
      this.consultationData.hoc = Number(document.getElementById('ob-hoc')?.value || 15);
      
      // Collect zones
      const frontSun = document.getElementById('ob-front-sun')?.value || 'Full Sun (6+ hrs)';
      const backSun = document.getElementById('ob-back-sun')?.value || 'Partial Shade (3-5 hrs)';
      const backGrass = document.getElementById('ob-back-grass')?.value || 'Buffalo / St Augustine';
      const backHoc = Number(document.getElementById('ob-back-hoc')?.value || 35);
      
      this.consultationData.zones = [
        { id: 'front', name: 'Front Yard', grassType: this.consultationData.grassType, hoc: this.consultationData.hoc, area: 120, sunExposure: frontSun },
        { id: 'back', name: 'Back Yard', grassType: backGrass, hoc: backHoc, area: 130, sunExposure: backSun }
      ];
    } else if (step === 3) {
      this.consultationData.mowerType = document.getElementById('ob-mower-type')?.value || 'Cylinder / Reel Mower';
      const eq = [];
      if (document.getElementById('ob-eq-reel')?.checked) eq.push('Cylinder / Reel Mower');
      if (document.getElementById('ob-eq-rotary')?.checked) eq.push('Rotary Mower with Roller');
      if (document.getElementById('ob-eq-sprayer')?.checked) eq.push('Battery Backpack Sprayer');
      if (document.getElementById('ob-eq-spreader')?.checked) eq.push('Calibrated Rotary Spreader');
      if (document.getElementById('ob-eq-scarifier')?.checked) eq.push('Dethatcher / Scarifier');
      if (document.getElementById('ob-eq-aerator')?.checked) eq.push('Coring Aerator');
      this.consultationData.equipment = eq;
    } else if (step === 4) {
      this.consultationData.lastMowDays = Number(document.getElementById('ob-last-mow')?.value || 3);
      this.consultationData.lastFertDays = Number(document.getElementById('ob-last-fert')?.value || 30);
      this.consultationData.lastFertType = document.getElementById('ob-fert-type')?.value || 'none';
      this.consultationData.preEmergentStatus = document.getElementById('ob-pre-emergent')?.value || 'none';
      this.consultationData.lastRenovation = document.getElementById('ob-renovation')?.value || 'never';
    }
  },

  renderConsultationSummary() {
    const d = this.consultationData;
    const diagContainer = document.getElementById('ob-diagnosis-container');
    const recProductsContainer = document.getElementById('ob-recommended-products');
    if (!diagContainer) return;

    let diagnosisHTML = `
      <div class="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
        <div class="font-bold flex items-center gap-1.5 text-emerald-900">
          <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
          <span>Blade's Agronomic Assessment:</span>
        </div>
        <p class="leading-relaxed">Targeting <strong>${d.tier === 'full_pro' ? 'Tournament / Bowling Green Perfection' : d.tier === 'semi_pro' ? 'Semi-Pro Striping Pride' : 'Weekend Warrior Chill'}</strong>.</p>
        <div class="pt-1.5 border-t border-emerald-200/80 text-[11px] text-emerald-800 space-y-1">
          <div>• Front Yard: <strong>${d.grassType} @ ${d.hoc}mm</strong></div>
          <div>• Back Yard: <strong>${d.zones[1]?.grassType || 'Buffalo'} @ ${d.zones[1]?.hoc || 35}mm (${d.zones[1]?.sunExposure || 'Shaded'})</strong></div>
          <div>• Mower: <strong>${d.mowerType}</strong></div>
          <div>• Weed Barrier: <strong>${d.preEmergentStatus === 'active' ? 'Active' : 'Missing / Urgent'}</strong></div>
        </div>
      </div>
    `;
    diagContainer.innerHTML = diagnosisHTML;

    if (recProductsContainer) {
      const recs = [
        {
          key: 'preEmergent',
          name: 'Prodiamine / Spartan Pre-Emergent',
          why: 'Blocks weeds before seeds ever germinate in the topsoil.',
          source: 'Available at lawntips.com',
          url: 'https://lawntips.com'
        },
        {
          key: 'foliar',
          name: 'Lawn Tips Foliar & Chelated Iron Pack',
          why: 'Unlocks deep emerald chlorophyll pop without explosive growth surges.',
          source: 'Available at lawntips.com',
          url: 'https://lawntips.com'
        },
        {
          key: 'wetting',
          name: 'Tournament Wetting Agent (Hydra-Flo)',
          why: 'Stops dry hydrophobic patches and cuts watering demand by 30%.',
          source: 'Available at lawntips.com',
          url: 'https://lawntips.com'
        }
      ];

      recProductsContainer.innerHTML = recs.map(r => {
        const isOwned = d.customOwnedProducts.some(p => p.key === r.key);
        const ownedText = d.customOwnedProducts.find(p => p.key === r.key)?.name || '';

        return `
          <div class="p-3 bg-white rounded-2xl border ${isOwned ? 'border-emerald-400 bg-emerald-50/30' : 'border-slate-200'} shadow-sm space-y-2 text-xs">
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-0.5">
                <strong class="text-slate-900 block">${r.name}</strong>
                <p class="text-[11px] text-slate-500">${r.why}</p>
                <span class="text-[10px] text-emerald-700 font-semibold block pt-0.5">${r.source}</span>
              </div>
              <a href="${r.url}" target="_blank" rel="noopener" class="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 text-emerald-800 border border-slate-200 rounded-xl text-[11px] font-bold flex items-center gap-1 flex-shrink-0">
                <span>Shop</span>
                <i data-lucide="external-link" class="w-3 h-3"></i>
              </a>
            </div>

            <!-- "I have this" toggle and entry field -->
            <div class="pt-2 border-t border-slate-100">
              ${isOwned ? `
                <div class="flex items-center justify-between text-emerald-800 bg-emerald-100/70 p-2 rounded-xl text-[11px]">
                  <span>✓ You have: <strong>${ownedText}</strong></span>
                  <button type="button" onclick="App.removeOwnedProduct('${r.key}')" class="text-xs text-slate-400 hover:text-slate-600">✕ Edit</button>
                </div>
              ` : `
                <button type="button" onclick="App.promptOwnedProduct('${r.key}', '${r.name}')" class="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1">
                  <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
                  <span>I already have this (Enter what I use)</span>
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');
    }
  },

  promptOwnedProduct(key, defaultName) {
    const brand = prompt(`What product do you currently have for ${defaultName}?`, 'Barricade 500EC');
    if (brand) {
      this.consultationData.customOwnedProducts = this.consultationData.customOwnedProducts.filter(p => p.key !== key);
      this.consultationData.customOwnedProducts.push({ key, name: brand });
      StorageManager.addCustomOwnedProduct(brand);
      this.renderConsultationSummary();
      this.showToast(`Saved "${brand}" to your gear profile!`);
    }
  },

  removeOwnedProduct(key) {
    this.consultationData.customOwnedProducts = this.consultationData.customOwnedProducts.filter(p => p.key !== key);
    this.renderConsultationSummary();
  },

  finishConsultation() {
    this.harvestStepData();
    const d = this.consultationData;

    this.profile.tier = d.tier;
    this.profile.grassType = d.grassType;
    this.profile.hoc = d.hoc;
    this.profile.equipment = d.equipment;
    this.profile.history = {
      lastMowDays: d.lastMowDays,
      lastFertDays: d.lastFertDays,
      lastFertType: d.lastFertType,
      preEmergentStatus: d.preEmergentStatus,
      lastRenovation: d.lastRenovation
    };

    // Save Zones
    if (d.zones && d.zones.length > 0) {
      StorageManager.saveZones(d.zones);
    }

    const initialLogs = StorageManager.getLogs();
    const mowDate = new Date();
    mowDate.setDate(mowDate.getDate() - d.lastMowDays);
    initialLogs.lastMow = mowDate.toISOString();

    const fertDate = new Date();
    fertDate.setDate(fertDate.getDate() - d.lastFertDays);
    initialLogs.lastFeed = fertDate.toISOString();
    localStorage.setItem(StorageManager.KEYS.LOGS, JSON.stringify(initialLogs));

    StorageManager.saveProfile(this.profile);
    StorageManager.setOnboarded(true);

    // If an initial photo was taken during onboarding, analyze it now
    if (d.initialPhotoData) {
      this.showOnboarding(false);
      this.runVisionAnalysis(d.initialPhotoData);
    } else {
      this.showOnboarding(false);
      this.handleProfileChange();
      this.switchTab('dashboard');
      this.showToast("🌱 High-five! Blade has initialized your 6-horizon roadmap.");
    }
  },

  renderProfileForm() {
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('prof-lawn-name', this.profile.lawnName);
    setVal('prof-grass-type', this.profile.grassType);
    setVal('prof-tier', this.profile.tier);
    setVal('prof-hoc', this.profile.hoc);
    setVal('prof-area', this.profile.lawnArea);
    setVal('prof-sprinklers', this.profile.sprinklers);
    setVal('prof-watering-freq', this.profile.wateringFreq);

    this.renderChecklistGroup('equipment-checklist', [
      'Cylinder / Reel Mower',
      'Rotary Mower with Roller',
      'Dethatcher / Scarifier',
      'Coring Aerator',
      'Battery Backpack Sprayer',
      'Calibrated Rotary Spreader'
    ], this.profile.equipment);

    this.renderChecklistGroup('fertilisers-checklist', [
      'Slow Release Granular (20-2-10)',
      'Liquid Foliar Nitrogen & Iron',
      'Seaweed & Humic Acid Biostimulant'
    ], this.profile.fertilisers);

    this.renderChecklistGroup('herbicides-checklist', [
      'Prodiamine / Barricade (Pre-emergent)',
      'Bow & Arrow / Dicamba (Selective Broadleaf)',
      'Primo Maxx / Plant Growth Regulator (PGR)',
      'Soil Wetting Agent (Surfactant)'
    ], [...this.profile.herbicides, ...(this.profile.specialTreatments || [])]);
  },

  renderChecklistGroup(containerId, options, activeList = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = options.map((opt, i) => {
      const checked = activeList.includes(opt);
      const inputId = `${containerId}_${i}`;
      return `
        <label for="${inputId}" class="flex items-center gap-2 p-2 rounded-xl border cursor-pointer select-none text-xs transition-colors ${checked ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium' : 'bg-white border-slate-200 text-slate-600'}">
          <input type="checkbox" id="${inputId}" value="${opt}" ${checked ? 'checked' : ''} class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" onchange="App.handleProfileChecklistChange('${containerId}')" />
          <span>${opt}</span>
        </label>
      `;
    }).join('');
  },

  handleProfileChecklistChange(containerId) {
    this.handleProfileChange();
  },

  handleProfileChange() {
    const getVal = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? el.value : fallback;
    };

    const getCheckedValues = (containerId) => {
      const container = document.getElementById(containerId);
      if (!container) return [];
      const checked = container.querySelectorAll('input[type="checkbox"]:checked');
      return Array.from(checked).map(c => c.value);
    };

    const updatedProfile = {
      lawnName: getVal('prof-lawn-name', 'My Turf'),
      grassType: getVal('prof-grass-type', 'Bermuda / Couch'),
      tier: getVal('prof-tier', 'semi_pro'),
      hoc: Number(getVal('prof-hoc', 15)),
      hocUnit: 'mm',
      lawnArea: Number(getVal('prof-area', 250)),
      areaUnit: 'm²',
      sprinklers: getVal('prof-sprinklers', 'In-Ground MP Rotators'),
      wateringFreq: getVal('prof-watering-freq', '2 times/week'),
      wateringAmount: '12mm / 0.5 inch per session',
      equipment: getCheckedValues('equipment-checklist'),
      fertilisers: getCheckedValues('fertilisers-checklist'),
      herbicides: getCheckedValues('herbicides-checklist').filter(h => !h.includes('PGR') && !h.includes('Wetting Agent')),
      specialTreatments: getCheckedValues('herbicides-checklist').filter(h => h.includes('PGR') || h.includes('Wetting Agent')),
      customOwnedProducts: this.profile.customOwnedProducts || [],
      history: this.profile.history || {}
    };

    this.profile = updatedProfile;
    StorageManager.saveProfile(this.profile);

    const activeHealth = this.currentPlan ? this.currentPlan.healthScore : 85;
    const recomputedPlan = PlannerEngine.generateDynamicPlan({
      cvMetrics: {
        densityPercent: this.currentPlan?.densityScore || 85,
        avgDgci: this.currentPlan?.darkGreenColorIndex || 80,
        weedRatio: 0.02,
        brownRatio: 0.03,
        healthScore: activeHealth
      },
      weedLevel: this.currentPlan?.weedPressure || 'Low (<2%)',
      weeds: this.currentPlan?.weedsDetected || ['Clover spot'],
      diseaseOrStress: this.currentPlan?.diseaseOrStress || 'Healthy vigor',
      profile: this.profile,
      zones: StorageManager.getZones()
    });

    this.currentPlan.actionPlan = recomputedPlan;
    StorageManager.saveActivePlan(this.currentPlan);

    this.renderHeader();
    this.renderZoneBar();
    this.renderDashboard();
    this.renderTasksList();
    this.renderAnalytics();
  },

  renderNotificationStatus() {
    const statusBadge = document.getElementById('notification-permission-badge');
    if (!statusBadge) return;
    const granted = NotificationManager.hasPermission();
    statusBadge.innerText = granted ? 'Active & Enabled' : 'Disabled / Needs Permission';
    statusBadge.className = `px-2.5 py-1 rounded-full text-xs font-semibold ${granted ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`;
  },

  renderHistory() {
    const container = document.getElementById('history-scans-list');
    if (!container) return;
    const history = StorageManager.getScanHistory();

    if (history.length === 0) {
      container.innerHTML = `
        <div class="text-center py-6 text-slate-400 text-xs">
          No previous weekly scans yet. Upload or snap your first photo!
        </div>
      `;
      return;
    }

    container.innerHTML = history.slice(0, 5).map(scan => `
      <div class="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 text-xs">
        <div>
          <span class="font-medium text-slate-800">${scan.formattedDate}</span>
          <p class="text-[11px] text-slate-400 mt-0.5">${scan.overallVerdict.slice(0, 45)}...</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold">
            ${scan.healthScore}%
          </span>
        </div>
      </div>
    `).join('');
  },

  renderAnalytics() {
    const area = this.profile.lawnArea || 250;
    const tier = this.profile.tier;
    const targetNPerM2 = tier === 'full_pro' ? 18 : tier === 'semi_pro' ? 12 : 7;
    const totalAnnualN = Math.round((targetNPerM2 * area) / 1000);

    const nBudgetEl = document.getElementById('metric-n-budget');
    if (nBudgetEl) nBudgetEl.innerText = `${totalAnnualN} kg N / Year`;

    const mowingFreqEl = document.getElementById('metric-mow-freq');
    if (mowingFreqEl) {
      mowingFreqEl.innerText = tier === 'full_pro' ? '2 - 3x per week' : tier === 'semi_pro' ? '1 - 2x per week' : 'Every 2 - 3 weeks';
    }

    const hocEl = document.getElementById('metric-hoc');
    if (hocEl) {
      hocEl.innerText = `${this.profile.hoc} mm (${(this.profile.hoc / 25.4).toFixed(2)}")`;
    }
  },

  showToast(message) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-slate-900/95 text-white text-xs font-medium rounded-full shadow-2xl transition-all duration-300 pointer-events-none opacity-0';
      document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.classList.remove('opacity-0');
    setTimeout(() => toast.classList.add('opacity-0'), 2800);
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.log('ServiceWorker registration skipped:', err);
      });
    }
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
