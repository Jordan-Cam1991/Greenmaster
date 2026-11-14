/**
 * Main Application Controller for GreenMaster AI
 * Featuring "Blade" — Your Friendly Pocket Lawn Pal & Mascot!
 * Supports Multi-Photo Hotspot Inspection, Lawn Sections with Differing Attention Levels,
 * Custom Gear Entry, and Multi-Zone Planning.
 */
const App = {
  activeTab: 'dashboard',
  activeHorizon: 'oneWeek',
  activeZoneId: 'all',
  scanTargetZoneId: 'front_main',
  stagedPhotos: [],
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
      { id: 'front_main', name: 'Front Yard (Showpiece)', yard: 'Front Yard', attentionLevel: 'showpiece', grassType: 'Bermuda / Couch', hoc: 12, area: 90, sunExposure: 'Full Sun (6+ hrs)' },
      { id: 'front_verge', name: 'Front Nature Strip / Verge', yard: 'Front Yard', attentionLevel: 'recovery', grassType: 'Bermuda / Couch', hoc: 18, area: 30, sunExposure: 'Full Sun (6+ hrs)' },
      { id: 'back_main', name: 'Back Yard (Main Lawn)', yard: 'Back Yard', attentionLevel: 'standard', grassType: 'Buffalo / St Augustine', hoc: 35, area: 100, sunExposure: 'Partial Shade (3-5 hrs)' },
      { id: 'back_shade', name: 'Back Yard (Shaded Area)', yard: 'Back Yard', attentionLevel: 'recovery', grassType: 'Buffalo / St Augustine', hoc: 45, area: 30, sunExposure: 'Heavy Shade (<3 hrs)' }
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
    initialPhotos: [],
    customOwnedProducts: []
  },

  bladeDialogues: [
    "G'day! I'm <strong>Blade</strong>, your pocket lawn pal! 🌱 Before we dive into the app, let's have a quick chat about your lawn so I can help you achieve all your green dreams! Where are we starting from today?",
    "Awesome! Tell me about your lawn sections. People often have different areas needing differing attention — like a showpiece front lawn vs a high-traffic nature strip or shaded backyard!",
    "Love that! Let's check your shed. What mower and gear do you have ready to roll?",
    "To make your plan super accurate, tell me: when did your grass last get a haircut or some lawn food?",
    "Would you like to snap a few photos of your lawn sections right now? You can add multiple photos (overview + problem spots) or skip and do this later anytime! 📸",
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

    if (!StorageManager.isOnboarded()) {
      this.showOnboarding(true);
    }

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

    this.bindZoneEvents();

    // Multi-photo file input in AI Vision tab
    const photoInput = document.getElementById('lawn-photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', (e) => this.handlePhotosSelected(e));
    }

    // Onboarding photo input (multiple)
    const obPhotoInput = document.getElementById('ob-photo-input');
    if (obPhotoInput) {
      obPhotoInput.addEventListener('change', (e) => this.handleOnboardingPhotosSelected(e));
    }

    // Dropzone for AI Vision
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
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.processSelectedFiles(e.dataTransfer.files);
        }
      });
    }

    // Vision Section Target selector change
    const visionZoneSelect = document.getElementById('vision-zone-target');
    if (visionZoneSelect) {
      visionZoneSelect.addEventListener('change', (e) => {
        this.scanTargetZoneId = e.target.value;
      });
    }

    // Demo Turfs
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
    this.renderVisionZoneSelector();
    this.renderProfileForm();
    this.renderProfileSections();
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

    const attentionBadges = {
      'showpiece': '⭐ Showpiece',
      'recovery': '🔥 TLC / Recovery',
      'standard': '🌿 Standard',
      'low': '🛋️ Low-Key'
    };

    container.innerHTML = `
      <button data-zone-id="all" class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${this.activeZoneId === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
        <span>🌿 All Turf</span>
      </button>
      ${zones.map(z => `
        <button data-zone-id="${z.id}" class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${this.activeZoneId === z.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
          <span>${z.name}</span>
          <span class="text-[9px] px-1.5 py-0.2 rounded-full ${this.activeZoneId === z.id ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'}">${attentionBadges[z.attentionLevel] || '🌿'}</span>
        </button>
      `).join('')}
      <button onclick="App.promptAddZone()" class="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1 flex-shrink-0">
        <span>+ Add Section</span>
      </button>
    `;

    this.bindZoneEvents();
  },

  renderVisionZoneSelector() {
    const select = document.getElementById('vision-zone-target');
    if (!select) return;
    const zones = StorageManager.getZones();

    select.innerHTML = zones.map(z => `
      <option value="${z.id}" ${this.scanTargetZoneId === z.id ? 'selected' : ''}>
        ${z.name} (${z.attentionLevel === 'showpiece' ? '⭐ High Attention' : z.attentionLevel === 'recovery' ? '🔥 Recovery Patch' : 'Standard'})
      </option>
    `).join('');
  },

  promptAddZone() {
    this.openSectionModal();
  },

  renderProfileSections() {
    const container = document.getElementById('profile-sections-list');
    if (!container) return;
    const zones = StorageManager.getZones();

    const attentionBadges = {
      'showpiece': { label: '⭐ Showpiece', cls: 'bg-emerald-100 text-emerald-800' },
      'recovery': { label: '🔥 TLC / Recovery', cls: 'bg-amber-100 text-amber-800' },
      'standard': { label: '🌿 Standard', cls: 'bg-slate-100 text-slate-700' },
      'low': { label: '🛋️ Low-Key', cls: 'bg-slate-100 text-slate-500' }
    };

    if (zones.length === 0) {
      container.innerHTML = `
        <div class="text-center py-3 text-slate-400 text-xs">
          <span>No sections added yet. Tap "+ Add" to create your first area.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = zones.map(z => {
      const badge = attentionBadges[z.attentionLevel] || attentionBadges['standard'];
      return `
        <div class="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div class="space-y-0.5 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <strong class="text-slate-900 text-xs truncate">${z.name}</strong>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.cls}">${badge.label}</span>
            </div>
            <div class="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
              <span>${z.grassType || 'Turf'}</span>
              <span>•</span>
              <span>${z.hoc || 20}mm HOC</span>
              <span>•</span>
              <span>${z.sunExposure || 'Full Sun'}</span>
            </div>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <button type="button" onclick="App.openSectionModal('${z.id}')" class="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all" title="Edit Section">
              <i data-lucide="edit-3" class="w-4 h-4"></i>
            </button>
            ${zones.length > 1 ? `
              <button type="button" onclick="App.deleteCustomSection('${z.id}')" class="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Delete Section">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  openSectionModal(zoneId = null) {
    const modal = document.getElementById('section-modal');
    const titleEl = document.getElementById('section-modal-title');
    const idInput = document.getElementById('sec-modal-id');
    const nameInput = document.getElementById('sec-modal-name');
    const attentionSelect = document.getElementById('sec-modal-attention');
    const grassSelect = document.getElementById('sec-modal-grass');
    const sunSelect = document.getElementById('sec-modal-sun');
    const hocInput = document.getElementById('sec-modal-hoc');
    const areaInput = document.getElementById('sec-modal-area');

    if (!modal) return;

    if (zoneId) {
      const zones = StorageManager.getZones();
      const z = zones.find(item => item.id === zoneId);
      if (z) {
        if (titleEl) titleEl.innerText = 'Edit Lawn Section';
        if (idInput) idInput.value = z.id;
        if (nameInput) nameInput.value = z.name;
        if (attentionSelect) attentionSelect.value = z.attentionLevel || 'standard';
        if (grassSelect) grassSelect.value = z.grassType || 'Bermuda / Couch';
        if (sunSelect) sunSelect.value = z.sunExposure || 'Full Sun (6+ hrs)';
        if (hocInput) hocInput.value = z.hoc || 15;
        if (areaInput) areaInput.value = z.area || 50;
      }
    } else {
      if (titleEl) titleEl.innerText = 'Add Lawn Section';
      if (idInput) idInput.value = '';
      if (nameInput) nameInput.value = '';
      if (attentionSelect) attentionSelect.value = 'standard';
      if (grassSelect) grassSelect.value = this.profile.grassType || 'Bermuda / Couch';
      if (sunSelect) sunSelect.value = 'Full Sun (6+ hrs)';
      if (hocInput) hocInput.value = this.profile.hoc || 15;
      if (areaInput) areaInput.value = 50;
    }

    modal.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
    setTimeout(() => { if (nameInput) nameInput.focus(); }, 100);
  },

  closeSectionModal() {
    const modal = document.getElementById('section-modal');
    if (modal) modal.classList.add('hidden');
  },

  saveCustomSectionFromModal(e) {
    if (e && e.preventDefault) e.preventDefault();
    const id = document.getElementById('sec-modal-id')?.value;
    const name = document.getElementById('sec-modal-name')?.value.trim();
    if (!name) {
      this.showToast('Please give your section a name.');
      return;
    }
    const attentionLevel = document.getElementById('sec-modal-attention')?.value || 'standard';
    const grassType = document.getElementById('sec-modal-grass')?.value || 'Bermuda / Couch';
    const sunExposure = document.getElementById('sec-modal-sun')?.value || 'Full Sun (6+ hrs)';
    const hoc = Number(document.getElementById('sec-modal-hoc')?.value || 15);
    const area = Number(document.getElementById('sec-modal-area')?.value || 50);

    if (id) {
      StorageManager.updateZone(id, { name, attentionLevel, grassType, sunExposure, hoc, area });
      this.showToast(`Updated section "${name}"!`);
    } else {
      StorageManager.addZone({ name, attentionLevel, grassType, sunExposure, hoc, area });
      this.showToast(`Added section "${name}"!`);
    }

    this.closeSectionModal();
    this.handleProfileChange();
  },

  deleteCustomSection(id) {
    const zones = StorageManager.getZones();
    if (zones.length <= 1) {
      this.showToast('You must keep at least one lawn section.');
      return;
    }
    const target = zones.find(z => z.id === id);
    if (confirm(`Are you sure you want to remove "${target ? target.name : 'this section'}"?`)) {
      StorageManager.deleteZone(id);
      this.handleProfileChange();
      this.showToast('Section removed.');
    }
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
      if (activeZone && activeZone.attentionLevel === 'recovery') {
        mascotTipEl.innerText = `Blade's TLC Alert: "${activeZone.name} is in Recovery Mode! Focus on soil hydration, wetting agent drench, and weed removal before scalping down cut height!" 🩹`;
      } else if (activeZone && activeZone.sunExposure.includes('Shade')) {
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

  /* ------------------- MULTI-PHOTO STAGING & ANALYSIS ------------------- */

  handlePhotosSelected(e) {
    if (e.target.files && e.target.files.length > 0) {
      this.processSelectedFiles(e.target.files);
    }
  },

  processSelectedFiles(fileList) {
    Array.from(fileList).forEach(file => {
      if (this.stagedPhotos.length >= 6) {
        this.showToast('Maximum 6 photos per scan session.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        this.addStagedPhoto(event.target.result);
      };
      reader.readAsDataURL(file);
    });
  },

  addStagedPhoto(dataUrl) {
    this.stagedPhotos.push(dataUrl);
    this.renderStagedPhotosUI();
  },

  removeStagedPhoto(idx) {
    this.stagedPhotos.splice(idx, 1);
    this.renderStagedPhotosUI();
  },

  clearStagedPhotos() {
    this.stagedPhotos = [];
    this.renderStagedPhotosUI();
  },

  renderStagedPhotosUI() {
    const container = document.getElementById('staged-photos-container');
    const analyzeBtn = document.getElementById('multi-scan-submit-btn');
    const emptyPrompt = document.getElementById('staged-empty-prompt');
    const countBadge = document.getElementById('staged-photo-count');

    if (countBadge) {
      countBadge.innerText = `${this.stagedPhotos.length} Photo${this.stagedPhotos.length === 1 ? '' : 's'}`;
    }

    if (!container) return;

    if (this.stagedPhotos.length === 0) {
      container.innerHTML = '';
      if (emptyPrompt) emptyPrompt.classList.remove('hidden');
      if (analyzeBtn) analyzeBtn.classList.add('hidden');
      return;
    }

    if (emptyPrompt) emptyPrompt.classList.add('hidden');
    if (analyzeBtn) analyzeBtn.classList.remove('hidden');

    const photoLabels = ['Wide Angle Overview', 'Problem Patch 1', 'Problem Patch 2', 'Close-up Cut Quality', 'Edge / Weed Spot'];

    container.innerHTML = this.stagedPhotos.map((src, idx) => `
      <div class="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 group shadow-sm flex flex-col">
        <img src="${src}" class="w-full h-24 object-cover" alt="Angle ${idx + 1}">
        <div class="p-1.5 bg-white text-[10px] font-semibold text-slate-700 flex items-center justify-between">
          <span>${photoLabels[idx] || `Angle ${idx + 1}`}</span>
          <button type="button" onclick="App.removeStagedPhoto(${idx})" class="w-5 h-5 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center font-bold text-xs">✕</button>
        </div>
      </div>
    `).join('');
  },

  handleOnboardingPhotosSelected(e) {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.consultationData.initialPhotos.push(event.target.result);
          this.renderOnboardingPhotosPreview();
        };
        reader.readAsDataURL(file);
      });
    }
  },

  renderOnboardingPhotosPreview() {
    const container = document.getElementById('ob-photos-preview-grid');
    const statusText = document.getElementById('ob-photo-status');
    const photos = this.consultationData.initialPhotos;

    if (statusText) {
      statusText.innerText = `${photos.length} photo${photos.length === 1 ? '' : 's'} added! Blade will analyze all angles together.`;
    }

    if (!container) return;
    container.innerHTML = photos.map(src => `
      <div class="relative rounded-xl overflow-hidden border border-slate-200">
        <img src="${src}" class="w-full h-16 object-cover" alt="Lawn preview">
      </div>
    `).join('');
  },

  loadDemoTurf(type) {
    const dataUrl = VisionEngine.createDemoTurfImage(type);
    this.stagedPhotos = [dataUrl];
    this.renderStagedPhotosUI();
    this.triggerMultiPhotoAnalysis();
  },

  async triggerMultiPhotoAnalysis() {
    if (this.stagedPhotos.length === 0) {
      this.showToast('Please add at least 1 photo to inspect.');
      return;
    }

    this.isScanning = true;
    const laser = document.getElementById('scanner-laser');
    if (laser) laser.classList.remove('hidden');

    const zones = StorageManager.getZones();
    const targetZone = zones.find(z => z.id === this.scanTargetZoneId) || zones[0];

    try {
      const settings = StorageManager.getSettings();
      const result = await VisionEngine.analyzeMultipleImages(this.stagedPhotos, this.profile, targetZone, settings.apiKey);

      this.currentPlan = {
        date: new Date().toISOString(),
        ...result
      };
      StorageManager.saveActivePlan(this.currentPlan);
      StorageManager.addScanRecord(result, targetZone ? targetZone.id : 'all');

      setTimeout(() => {
        this.isScanning = false;
        if (laser) laser.classList.add('hidden');
        this.clearStagedPhotos();
        this.renderAll();
        this.showScanResultModal(result, targetZone);
        NotificationManager.playTone();
      }, 1400);

    } catch (e) {
      console.error('Vision analysis error', e);
      this.isScanning = false;
      if (laser) laser.classList.add('hidden');
      this.showToast('Analysis error. Please try another photo.');
    }
  },

  showScanResultModal(result, zoneInfo = null) {
    const verdictEl = document.getElementById('modal-verdict');
    const healthEl = document.getElementById('modal-health');
    const densityEl = document.getElementById('modal-density');
    const dgciEl = document.getElementById('modal-dgci');
    const weedEl = document.getElementById('modal-weed');
    const stressEl = document.getElementById('modal-stress');
    const hotspotsListEl = document.getElementById('modal-hotspots-list');
    const modalSectionName = document.getElementById('modal-section-name');

    if (modalSectionName) {
      modalSectionName.innerText = zoneInfo ? `${zoneInfo.name} (${result.photoCount} photos)` : `Composite Turf Scan (${result.photoCount} photos)`;
    }

    if (verdictEl) verdictEl.innerText = result.overallVerdict;
    if (healthEl) healthEl.innerText = `${result.healthScore}%`;
    if (densityEl) densityEl.innerText = `${result.densityScore}%`;
    if (dgciEl) dgciEl.innerText = `${result.darkGreenColorIndex}/100`;
    if (weedEl) weedEl.innerText = result.weedPressure;
    if (stressEl) stressEl.innerText = result.diseaseOrStress;

    if (hotspotsListEl) {
      if (result.hotspots && result.hotspots.length > 0) {
        hotspotsListEl.innerHTML = `
          <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <span class="font-bold flex items-center gap-1">⚠️ Pinpointed Micro-Problems:</span>
            ${result.hotspots.map(h => `
              <div class="pl-2 border-l-2 border-amber-400">
                <strong>${h.label}</strong>
                <p class="text-[11px] text-amber-800">${h.recommendation}</p>
              </div>
            `).join('')}
          </div>
        `;
        hotspotsListEl.classList.remove('hidden');
      } else {
        hotspotsListEl.innerHTML = '';
        hotspotsListEl.classList.add('hidden');
      }
    }

    const modal = document.getElementById('scan-result-modal');
    if (modal) modal.classList.remove('hidden');
  },

  closeModal() {
    const modal = document.getElementById('scan-result-modal');
    if (modal) modal.classList.add('hidden');
    this.switchTab('planner');
  },

  /* ------------------- ONBOARDING & CONSULTATION WIZARD ------------------- */

  showOnboarding(show = true) {
    const modal = document.getElementById('onboarding-modal');
    if (modal) {
      modal.classList.toggle('hidden', !show);
      if (show) {
        this.onboardingStep = 1;
        const currentZones = StorageManager.getZones();
        this.consultationData.zones = currentZones && currentZones.length > 0 ? currentZones.map(z => ({ ...z })) : [];
        if (this.profile && Array.isArray(this.profile.customOwnedProducts)) {
          this.consultationData.customOwnedProducts = this.profile.customOwnedProducts.map((name, i) => ({
            key: 'existing_' + i,
            name: name
          }));
        }
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

    if (this.onboardingStep === 2) {
      this.renderOnboardingSections();
    } else if (this.onboardingStep === 6) {
      this.renderConsultationSummary();
    }

    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  renderOnboardingSections() {
    const container = document.getElementById('ob-sections-list');
    if (!container) return;

    if (!this.consultationData.zones || this.consultationData.zones.length === 0) {
      const existing = StorageManager.getZones();
      this.consultationData.zones = existing && existing.length > 0 ? existing.map(z => ({ ...z })) : [
        {
          id: 'zone_front',
          name: 'Front Yard (Main)',
          attentionLevel: 'showpiece',
          grassType: 'Bermuda / Couch',
          sunExposure: 'Full Sun (6+ hrs)',
          hoc: 12
        },
        {
          id: 'zone_back',
          name: 'Back Yard (Family Area)',
          attentionLevel: 'standard',
          grassType: 'Buffalo / St Augustine',
          sunExposure: 'Partial Shade (3-5 hrs)',
          hoc: 35
        }
      ];
    }

    container.innerHTML = this.consultationData.zones.map((z) => `
      <div class="ob-zone-card p-3 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2.5 transition-all" data-zone-id="${z.id}">
        <!-- Section Header with editable name and delete -->
        <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
          <div class="flex items-center gap-1.5 flex-1 min-w-0">
            <span class="text-sm">🌱</span>
            <input type="text" value="${z.name}" placeholder="Section Name (e.g. Front Lawn)" 
              class="ob-sec-name font-bold text-xs text-slate-800 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 rounded-lg px-2 py-1 w-full focus:ring-2 focus:ring-emerald-500 focus:outline-none transition-all">
          </div>
          ${this.consultationData.zones.length > 1 ? `
            <button type="button" onclick="App.removeOnboardingSection('${z.id}')" class="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-all flex items-center gap-0.5 text-[10px] font-semibold flex-shrink-0" title="Delete Section">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              <span>Remove</span>
            </button>
          ` : ''}
        </div>

        <!-- Attention Level -->
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Attention Level</span>
          <select class="ob-sec-attention bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500">
            <option value="showpiece" ${z.attentionLevel === 'showpiece' ? 'selected' : ''}>⭐ Showpiece (High Attention)</option>
            <option value="standard" ${z.attentionLevel === 'standard' ? 'selected' : ''}>🌿 Standard Care</option>
            <option value="recovery" ${z.attentionLevel === 'recovery' ? 'selected' : ''}>🔥 Recovery / TLC Mode</option>
            <option value="low" ${z.attentionLevel === 'low' ? 'selected' : ''}>🛋️ Low-Key / Minimal</option>
          </select>
        </div>

        <!-- Grass & Sun -->
        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="text-[9px] font-semibold text-slate-400 block mb-0.5">Grass Variety</span>
            <select class="ob-sec-grass w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500">
              <option value="Bermuda / Couch" ${(z.grassType || '').includes('Bermuda') || (z.grassType || '').includes('Couch') ? 'selected' : ''}>Bermuda / Couch</option>
              <option value="Buffalo / St Augustine" ${(z.grassType || '').includes('Buffalo') ? 'selected' : ''}>Buffalo / Sir Walter</option>
              <option value="Zoysia" ${(z.grassType || '').includes('Zoysia') ? 'selected' : ''}>Zoysia</option>
              <option value="Kikuyu" ${(z.grassType || '').includes('Kikuyu') ? 'selected' : ''}>Kikuyu</option>
              <option value="Kentucky Bluegrass" ${(z.grassType || '').includes('Kentucky') ? 'selected' : ''}>Kentucky Bluegrass</option>
              <option value="Tall Fescue" ${(z.grassType || '').includes('Fescue') ? 'selected' : ''}>Tall Fescue</option>
              <option value="Perennial Ryegrass" ${(z.grassType || '').includes('Ryegrass') ? 'selected' : ''}>Ryegrass</option>
            </select>
          </div>
          <div>
            <span class="text-[9px] font-semibold text-slate-400 block mb-0.5">Sun Exposure</span>
            <select class="ob-sec-sun w-full bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-xs text-slate-800 focus:ring-2 focus:ring-emerald-500">
              <option value="Full Sun (6+ hrs)" ${(z.sunExposure || '').includes('Full') ? 'selected' : ''}>Full Sun (6+ hrs)</option>
              <option value="Partial Shade (3-5 hrs)" ${(z.sunExposure || '').includes('Partial') ? 'selected' : ''}>Partial Shade (3-5 hrs)</option>
              <option value="Heavy Shade (<3 hrs)" ${(z.sunExposure || '').includes('Heavy') ? 'selected' : ''}>Heavy Shade (<3 hrs)</option>
            </select>
          </div>
        </div>

        <!-- Height of Cut -->
        <div class="flex items-center justify-between text-xs pt-1">
          <div class="flex flex-col">
            <span class="text-slate-600 font-medium text-[11px]">Target Cut Height (HOC):</span>
            <span class="text-[9px] text-slate-400">Shaded areas need +10-15mm higher</span>
          </div>
          <div class="flex items-center gap-1">
            <input type="number" min="5" max="80" value="${z.hoc || 20}" 
              class="ob-sec-hoc w-16 bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs font-bold text-slate-800 text-center focus:bg-white focus:ring-2 focus:ring-emerald-500">
            <span class="text-slate-500 font-medium">mm</span>
          </div>
        </div>
      </div>
    `).join('');

    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  addOnboardingSection(initialData = {}) {
    this.harvestOnboardingSections();
    const count = this.consultationData.zones.length + 1;
    const newZone = {
      id: 'zone_' + Date.now(),
      name: initialData.name || `Section ${count}`,
      attentionLevel: initialData.attentionLevel || 'standard',
      grassType: initialData.grassType || (this.consultationData.grassType || 'Bermuda / Couch'),
      sunExposure: initialData.sunExposure || 'Full Sun (6+ hrs)',
      hoc: initialData.hoc || 20,
      area: 50
    };
    this.consultationData.zones.push(newZone);
    this.renderOnboardingSections();
    this.showToast(`Added "${newZone.name}"`);
  },

  addQuickSection(name, attentionLevel, grassType, sunExposure, hoc) {
    this.addOnboardingSection({ name, attentionLevel, grassType, sunExposure, hoc });
  },

  removeOnboardingSection(id) {
    this.harvestOnboardingSections();
    if (this.consultationData.zones.length <= 1) {
      this.showToast('You must have at least one lawn section.');
      return;
    }
    this.consultationData.zones = this.consultationData.zones.filter(z => z.id !== id);
    this.renderOnboardingSections();
    this.showToast('Section removed.');
  },

  harvestOnboardingSections() {
    const cards = document.querySelectorAll('.ob-zone-card');
    if (!cards || cards.length === 0) return;
    const updated = [];
    cards.forEach(card => {
      const id = card.getAttribute('data-zone-id');
      const name = card.querySelector('.ob-sec-name')?.value.trim() || 'My Lawn';
      const attentionLevel = card.querySelector('.ob-sec-attention')?.value || 'standard';
      const grassType = card.querySelector('.ob-sec-grass')?.value || 'Bermuda / Couch';
      const sunExposure = card.querySelector('.ob-sec-sun')?.value || 'Full Sun (6+ hrs)';
      const hoc = Number(card.querySelector('.ob-sec-hoc')?.value || 20);

      updated.push({
        id: id || ('zone_' + Date.now()),
        name,
        attentionLevel,
        grassType,
        sunExposure,
        hoc,
        area: 50,
        yard: name.toLowerCase().includes('back') ? 'Back Yard' : 'Front Yard'
      });
    });
    this.consultationData.zones = updated;
  },

  harvestStepData() {
    const step = this.onboardingStep;
    if (step === 2) {
      this.consultationData.tier = document.querySelector('input[name="ob-tier"]:checked')?.value || 'semi_pro';
      this.harvestOnboardingSections();
      if (this.consultationData.zones && this.consultationData.zones.length > 0) {
        this.consultationData.grassType = this.consultationData.zones[0].grassType;
        this.consultationData.hoc = this.consultationData.zones[0].hoc;
      }
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

    const attentionNames = {
      'showpiece': '⭐ Showpiece',
      'recovery': '🔥 TLC / Recovery',
      'standard': '🌿 Standard Care',
      'low': '🛋️ Low-Key'
    };

    let diagnosisHTML = `
      <div class="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
        <div class="font-bold flex items-center gap-1.5 text-emerald-900">
          <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
          <span>Blade's Section Diagnosis:</span>
        </div>
        <p class="leading-relaxed">Configured <strong>${d.zones.length} distinct lawn section${d.zones.length === 1 ? '' : 's'}</strong> with custom names & attention levels.</p>
        <div class="pt-1.5 border-t border-emerald-200/80 text-[11px] text-emerald-800 space-y-1">
          ${d.zones.map(z => `
            <div>• <strong>${z.name}</strong>: ${z.grassType} @ ${z.hoc}mm (${attentionNames[z.attentionLevel] || '🌿 Standard'})</div>
          `).join('')}
          <div class="pt-1 text-[10px] text-emerald-700">• Pre-Emergent: <strong>${d.preEmergentStatus === 'active' ? 'Active' : 'Missing / Urgent Application'}</strong></div>
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

            <div class="pt-2 border-t border-slate-100">
              ${isOwned ? `
                <div class="flex items-center justify-between text-emerald-800 bg-emerald-100/70 p-2 rounded-xl text-[11px]">
                  <span>✓ In your arsenal: <strong>${ownedText}</strong></span>
                  <button type="button" onclick="App.removeOwnedProduct('${r.key}')" class="text-xs text-rose-600 hover:text-rose-800 font-bold ml-2">✕ Edit</button>
                </div>
              ` : `
                <div>
                  <button type="button" onclick="App.toggleOwnedInput('${r.key}')" class="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1">
                    <i data-lucide="plus-circle" class="w-3.5 h-3.5"></i>
                    <span>I already have this (Enter what I use)</span>
                  </button>
                  <div id="owned-input-row-${r.key}" class="hidden mt-2 flex items-center gap-1.5">
                    <input type="text" id="owned-input-val-${r.key}" placeholder="e.g. Barricade 500EC, Spartan, Scotts" class="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                    <button type="button" onclick="App.saveOwnedProductInline('${r.key}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm">Save</button>
                    <button type="button" onclick="App.toggleOwnedInput('${r.key}')" class="px-2 py-1.5 text-slate-400 hover:text-slate-600 text-xs">Cancel</button>
                  </div>
                </div>
              `}
            </div>
          </div>
        `;
      }).join('') + `
        <!-- Custom shed gear entry -->
        <div class="p-3 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-xs space-y-2 mt-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-700 text-[11px] uppercase tracking-wide">Have other products in your shed?</span>
            <span class="text-[10px] text-slate-400">Optional</span>
          </div>
          <p class="text-[11px] text-slate-500">Add any fertilisers, wetting agents, weed killers, or PGRs already in your arsenal.</p>
          <div class="flex items-center gap-1.5">
            <input type="text" id="extra-product-input" placeholder="e.g. Primo Maxx PGR, Bow & Arrow, Dynamic Lifter" class="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none">
            <button type="button" onclick="App.addExtraProductFromOnboarding()" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1">
              <span>+ Add</span>
            </button>
          </div>
          ${d.customOwnedProducts.filter(p => !['preEmergent', 'foliar', 'wetting'].includes(p.key)).length > 0 ? `
            <div class="pt-1.5 flex flex-wrap gap-1.5">
              ${d.customOwnedProducts.filter(p => !['preEmergent', 'foliar', 'wetting'].includes(p.key)).map(extra => `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-semibold">
                  <span>${extra.name}</span>
                  <button type="button" onclick="App.removeOwnedProduct('${extra.key}')" class="text-emerald-950 font-bold hover:text-rose-600">×</button>
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }
  },

  toggleOwnedInput(key) {
    const row = document.getElementById(`owned-input-row-${key}`);
    if (row) {
      row.classList.toggle('hidden');
      const input = document.getElementById(`owned-input-val-${key}`);
      if (!row.classList.contains('hidden') && input) input.focus();
    }
  },

  saveOwnedProductInline(key) {
    const input = document.getElementById(`owned-input-val-${key}`);
    const val = input ? input.value.trim() : '';
    if (!val) {
      this.showToast('Please type a product or brand name.');
      return;
    }
    this.consultationData.customOwnedProducts = this.consultationData.customOwnedProducts.filter(p => p.key !== key);
    this.consultationData.customOwnedProducts.push({ key, name: val });
    StorageManager.addCustomOwnedProduct(val);
    this.renderConsultationSummary();
    this.showToast(`Saved "${val}" to your gear profile!`);
    if (window.lucide) lucide.createIcons();
  },

  addExtraProductFromOnboarding() {
    const input = document.getElementById('extra-product-input');
    const val = input ? input.value.trim() : '';
    if (!val) {
      this.showToast('Please enter a product name first.');
      return;
    }
    const key = 'custom_' + Date.now();
    this.consultationData.customOwnedProducts.push({ key, name: val });
    StorageManager.addCustomOwnedProduct(val);
    this.renderConsultationSummary();
    this.showToast(`Added "${val}" to your shed!`);
    if (window.lucide) lucide.createIcons();
  },

  promptOwnedProduct(key, defaultName) {
    this.toggleOwnedInput(key);
  },

  removeOwnedProduct(key) {
    this.consultationData.customOwnedProducts = this.consultationData.customOwnedProducts.filter(p => p.key !== key);
    this.renderConsultationSummary();
    if (window.lucide) lucide.createIcons();
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

    if (d.customOwnedProducts && d.customOwnedProducts.length > 0) {
      if (!this.profile.customOwnedProducts) this.profile.customOwnedProducts = [];
      d.customOwnedProducts.forEach(p => {
        if (!this.profile.customOwnedProducts.includes(p.name)) {
          this.profile.customOwnedProducts.push(p.name);
        }
      });
    }

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

    if (d.initialPhotos && d.initialPhotos.length > 0) {
      this.showOnboarding(false);
      this.stagedPhotos = [...d.initialPhotos];
      this.triggerMultiPhotoAnalysis();
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
    this.renderVisionZoneSelector();
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

    container.innerHTML = history.slice(0, 6).map(scan => `
      <div class="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 text-xs">
        <div>
          <div class="flex items-center gap-1.5">
            <span class="font-medium text-slate-800">${scan.formattedDate}</span>
            <span class="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600">${scan.photoCount || 1} photo${scan.photoCount === 1 ? '' : 's'}</span>
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5">${scan.overallVerdict.slice(0, 48)}...</p>
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
