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
  plannerMode: 'segmented',
  scanTargetZoneId: 'front_main',
  stagedPhotosByZone: {},
  modalViewingZoneId: null,
  latestZoneScanResults: {},
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
    currentPhotoZoneId: null,
    zonePhotos: {},
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
    this.plannerMode = StorageManager.getPlannerMode();
    this.mowPatternIdx = parseInt(localStorage.getItem('gm_mow_pattern_idx') || '0', 10) || 0;

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

    this.weather = WeatherEngine.getFallbackWeather();
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
      this.renderDashboard();
      this.renderTasksList();
      this.renderWeatherZones();
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
    const dropZone = document.getElementById('staged-empty-prompt');
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
        this.renderStagedPhotosUI();
        const zoneName = StorageManager.getZones().find(z => z.id === this.scanTargetZoneId)?.name || 'section';
        this.showToast(`Ready for photos of "${zoneName}"`);
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
        const calData = this.getCalendarSchedule(30);
        NotificationManager.exportPlanToCalendar(this.currentPlan, calData.days);
        this.showToast('📅 Calendar (.ics) downloaded! Open to add to Apple or Google Calendar.');
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

    const syncAllCheck = document.getElementById('ob-sync-all-sections');
    if (syncAllCheck) {
      syncAllCheck.addEventListener('change', () => {
        if (syncAllCheck.checked) {
          this.saveCurrentZoneHistoryFromForm();
          this.showToast('Applied current dates to all sections!');
        }
      });
    }

    window.addEventListener('resize', () => this.syncHeaderSpacer());
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
    if (zoneId && zoneId !== 'all') {
      const zoneResult = this.getSectionAnalysisResult(zoneId);
      if (zoneResult) {
        this.currentPlan = {
          date: zoneResult.date || new Date().toISOString(),
          ...zoneResult
        };
      }
      this.scanTargetZoneId = zoneId;
    } else {
      const savedMasterPlan = StorageManager.getActivePlan();
      if (savedMasterPlan) {
        this.currentPlan = savedMasterPlan;
      }
    }
    this.renderHeader();
    this.renderZoneBar();
    this.renderDashboard();
    this.renderTasksList();
    this.renderVisionZoneSelector();
    this.renderWeatherZones();
    this.renderAnalytics();
  },

  setPlannerMode(mode) {
    this.plannerMode = mode === 'aligned' ? 'aligned' : 'segmented';
    StorageManager.setPlannerMode(this.plannerMode);
    this.renderTasksList();
    this.renderDashboard();
    this.showToast(
      this.plannerMode === 'aligned'
        ? '🔗 Planner set to Align All Zones Together'
        : '🗂️ Planner set to Segmented by Yard Zone'
    );
  },

  getSectionAnalysisResult(zoneId) {
    const zones = StorageManager.getZones();
    const targetZone = zones.find(z => z.id === zoneId) || zones[0];
    if (!targetZone) return this.currentPlan;

    const zoneLogs = StorageManager.getZoneLogs(targetZone.id);
    const zoneProfile = {
      ...this.profile,
      grassType: targetZone.grassType || this.profile.grassType,
      hoc: targetZone.hoc || this.profile.hoc,
      lawnArea: targetZone.area || 50,
      history: {
        ...(this.profile.history || {}),
        preEmergentStatus: zoneLogs.preEmergentStatus || this.profile.history?.preEmergentStatus || 'active',
        lastFertType: zoneLogs.lastFeedProduct || this.profile.history?.lastFertType || 'Liquid Foliar'
      }
    };

    if (this.latestZoneScanResults && this.latestZoneScanResults[targetZone.id]) {
      const cached = this.latestZoneScanResults[targetZone.id];
      cached.actionPlan = PlannerEngine.generateDynamicPlan({
        cvMetrics: {
          densityPercent: cached.densityScore || 82,
          avgDgci: cached.darkGreenColorIndex || 78,
          weedRatio: 0.02,
          brownRatio: 0.04,
          healthScore: cached.healthScore || 84
        },
        weedLevel: cached.weedPressure || 'Low (<2%)',
        weeds: cached.weedsDetected || [],
        diseaseOrStress: cached.diseaseOrStress || 'None detected',
        hotspots: cached.hotspots || [],
        profile: zoneProfile,
        zones: [targetZone],
        targetZone
      });
      return cached;
    }

    const storedZonePlan = StorageManager.getZonePlan(targetZone.id);
    if (storedZonePlan) {
      storedZonePlan.actionPlan = PlannerEngine.generateDynamicPlan({
        cvMetrics: {
          densityPercent: storedZonePlan.densityScore || 82,
          avgDgci: storedZonePlan.darkGreenColorIndex || 78,
          weedRatio: 0.02,
          brownRatio: 0.04,
          healthScore: storedZonePlan.healthScore || 84
        },
        weedLevel: storedZonePlan.weedPressure || 'Low (<2%)',
        weeds: storedZonePlan.weedsDetected || [],
        diseaseOrStress: storedZonePlan.diseaseOrStress || 'None detected',
        hotspots: storedZonePlan.hotspots || [],
        profile: zoneProfile,
        zones: [targetZone],
        targetZone
      });
      return storedZonePlan;
    }

    // Generate tailored agronomic baseline for this specific section if no photos scanned yet
    const isRecovery = targetZone.attentionLevel === 'recovery';
    const isShowpiece = targetZone.attentionLevel === 'showpiece';
    const isShaded = (targetZone.sunExposure || '').toLowerCase().includes('shade');

    const healthScore = isRecovery ? 58 : isShowpiece ? 89 : isShaded ? 74 : 82;
    const densityScore = isRecovery ? 62 : isShowpiece ? 88 : isShaded ? 72 : 80;
    const dgci = isRecovery ? 56 : isShowpiece ? 85 : isShaded ? 75 : 79;
    const weedPressure = isRecovery ? 'Moderate (Recovery Area)' : 'Low (<2%)';
    const stressText = isRecovery
      ? 'High traffic / localized dry patch or recovery zone'
      : isShaded
      ? `Filtered sunlight (${targetZone.sunExposure}) — watch canopy moisture & maintain ${targetZone.hoc}mm cut`
      : 'Healthy active stolon vigor';

    const hotspots = [];
    if (isRecovery) {
      hotspots.push({
        label: `${targetZone.name}: TLC / Recovery Priority`,
        recommendation: `Apply soil wetting agent drench and liquid foliar feed before lowering cut height below ${targetZone.hoc}mm.`
      });
    }
    if (isShaded) {
      hotspots.push({
        label: `${targetZone.name}: Shade Canopy Management`,
        recommendation: `Keep mower height at ${targetZone.hoc}mm+ to maximize leaf surface area for photosynthesis.`
      });
    }

    const actionPlan = PlannerEngine.generateDynamicPlan({
      cvMetrics: {
        densityPercent: densityScore,
        avgDgci: dgci,
        weedRatio: isRecovery ? 0.05 : 0.01,
        brownRatio: isRecovery ? 0.12 : 0.03,
        healthScore: healthScore
      },
      weedLevel: weedPressure,
      weeds: isRecovery ? ['Broadleaf spot'] : [],
      diseaseOrStress: stressText,
      hotspots: hotspots,
      profile: zoneProfile,
      zones: [targetZone],
      targetZone
    });

    const baselineVerdict = isRecovery
      ? `Baseline assessment for ${targetZone.name} (Recovery Mode): Focus on soil hydration, wetting agent application, and gentle ${targetZone.hoc}mm cuts while stolons thicken. Snap a photo anytime to pinpoint micro-patches!`
      : isShaded
      ? `Baseline assessment for ${targetZone.name} (${targetZone.sunExposure}): Tailored for ${targetZone.grassType} at ${targetZone.hoc}mm to protect shade density. Upload photos anytime for visual spot analysis!`
      : `Baseline assessment for ${targetZone.name}: Calibrated for ${targetZone.grassType} at ${targetZone.hoc}mm (${targetZone.sunExposure}). Add photos in AI Vision to scan for hotspots!`;

    return {
      zoneId: targetZone.id,
      photoCount: 0,
      isPhotoScan: false,
      healthScore,
      densityScore,
      darkGreenColorIndex: dgci,
      weedPressure,
      weedsDetected: [],
      hotspots,
      diseaseOrStress: stressText,
      overallVerdict: baselineVerdict,
      actionPlan
    };
  },

  switchTab(tab) {
    this.activeTab = tab;
    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.add('hidden');
    });
    const target = document.getElementById(`view-${tab}`);
    if (target) target.classList.remove('hidden');

    if (tab === 'vision') {
      const zones = StorageManager.getZones();
      if (this.activeZoneId !== 'all' && zones.some(z => z.id === this.activeZoneId)) {
        this.scanTargetZoneId = this.activeZoneId;
      }
      this.renderVisionZoneSelector();
      this.renderStagedPhotosUI();
    }

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
      btn.className = active
        ? 'horizon-tab active py-1.5 rounded-lg text-[11px] font-bold transition-all bg-white text-slate-900 shadow-2xs'
        : 'horizon-tab py-1.5 rounded-lg text-[11px] font-bold transition-all text-slate-600 hover:text-slate-900';
    });
    this.renderTasksList();
  },

  renderAll() {
    this.renderHeader();
    this.renderZoneBar();
    this.renderDashboard();
    this.renderTasksList();
    this.renderVisionZoneSelector();
    this.renderBladeChat();
    this.renderWeatherZones();
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

    this.renderHeaderZoneSelector();
    this.syncHeaderSpacer();
  },

  syncHeaderSpacer() {
    const header = document.getElementById('app-top-header');
    const spacer = document.getElementById('header-spacer');
    if (header && spacer) {
      const h = header.offsetHeight;
      if (h > 0) {
        spacer.style.height = `${h}px`;
      }
    }
  },

  renderHeaderZoneSelector() {
    const select = document.getElementById('header-section-select');
    if (!select) return;
    const zones = StorageManager.getZones();

    const attentionBadges = {
      'showpiece': '⭐ Showpiece',
      'recovery': '🔥 TLC / Recovery',
      'standard': '🌿 Standard',
      'low': '🛋️ Low-Key'
    };

    select.innerHTML = `
      <option value="all" ${this.activeZoneId === 'all' ? 'selected' : ''}>🌿 All Lawn Sections (Entire Property)</option>
      ${zones.map(z => `
        <option value="${z.id}" ${this.activeZoneId === z.id ? 'selected' : ''}>
          ${z.name} (${attentionBadges[z.attentionLevel] || '🌿 Standard'} • ${z.hoc}mm)
        </option>
      `).join('')}
    `;
  },

  handleHeaderZoneChange(zoneId) {
    this.switchZone(zoneId);
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
    if (zones.length > 0 && !zones.some(z => z.id === this.scanTargetZoneId)) {
      this.scanTargetZoneId = (this.activeZoneId !== 'all' && zones.some(z => z.id === this.activeZoneId))
        ? this.activeZoneId
        : zones[0].id;
    }

    select.innerHTML = zones.map(z => {
      const count = (this.stagedPhotosByZone[z.id] || []).length;
      const badge = z.attentionLevel === 'showpiece' ? '⭐ High Attention' : z.attentionLevel === 'recovery' ? '🔥 Recovery Patch' : '🌿 Standard';
      return `
        <option value="${z.id}" ${this.scanTargetZoneId === z.id ? 'selected' : ''}>
          ${z.name} (${badge})${count > 0 ? ` — ${count} photo${count === 1 ? '' : 's'}` : ''}
        </option>
      `;
    }).join('');

    const pillsBar = document.getElementById('vision-staged-zones-bar');
    if (pillsBar) {
      pillsBar.innerHTML = zones.map(z => {
        const count = (this.stagedPhotosByZone[z.id] || []).length;
        const isCurrent = z.id === this.scanTargetZoneId;
        return `
          <button type="button" onclick="App.selectVisionTargetZone('${z.id}')" class="px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1 ${isCurrent ? 'bg-emerald-600 text-white shadow-2xs' : count > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            <span>${count > 0 ? '📸' : '🌱'} ${z.name}</span>
            ${count > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[9px] ${isCurrent ? 'bg-emerald-800 text-white' : 'bg-emerald-600 text-white'}">${count}</span>` : ''}
          </button>
        `;
      }).join('');
    }
  },

  selectVisionTargetZone(zoneId) {
    this.scanTargetZoneId = zoneId;
    this.renderVisionZoneSelector();
    this.renderStagedPhotosUI();
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
              <strong class="text-slate-900 text-xs">${z.name}</strong>
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

  getCalendarSchedule(daysCount = null) {
    const horizonDaysMap = {
      oneWeek: 7,
      twoWeeks: 14,
      oneMonth: 30
    };
    const count = daysCount || horizonDaysMap[this.activeHorizon] || 7;
    const zones = StorageManager.getZones();
    const activeZone = this.activeZoneId !== 'all'
      ? (zones.find(z => z.id === this.activeZoneId) || null)
      : null;
    const zoneLogs = StorageManager.getZoneLogs(this.activeZoneId);
    const scanResult = activeZone
      ? this.getSectionAnalysisResult(activeZone.id)
      : this.currentPlan;

    return PlannerEngine.generateCalendarSchedule({
      activeZone,
      zones,
      weather: this.weather || WeatherEngine.getFallbackWeather(),
      zoneLogs,
      scanResult,
      daysCount: count
    });
  },

  renderDashboard() {
    const activeZone = StorageManager.getActiveZone();
    const zoneLogs = StorageManager.getZoneLogs(this.activeZoneId);
    const calData = this.getCalendarSchedule(14);
    const completedTasks = StorageManager.getCompletedTasks();

    // 1. Last Done & Next Scheduled (Auto-calculated from history & weather)
    const lastMowEl = document.getElementById('dash-last-mow-text');
    const nextMowEl = document.getElementById('dash-next-mow-date');
    if (lastMowEl) lastMowEl.innerText = this.formatRelativeTime(zoneLogs.lastMow);
    if (nextMowEl) nextMowEl.innerText = calData.summary.nextMowLabel;

    const waterStatusEl = document.getElementById('dash-water-status');
    const nextWaterEl = document.getElementById('dash-next-water-date');
    if (waterStatusEl) waterStatusEl.innerText = this.formatRelativeTime(zoneLogs.lastWater);
    if (nextWaterEl) nextWaterEl.innerText = calData.summary.nextWaterLabel;

    const fertStatusEl = document.getElementById('dash-fert-status');
    const nextFeedEl = document.getElementById('dash-next-feed-date');
    if (fertStatusEl) fertStatusEl.innerText = this.formatRelativeTime(zoneLogs.lastFeed);
    if (nextFeedEl) nextFeedEl.innerText = calData.summary.nextFeedLabel;

    // 2. Up Next on Your Calendar (First uncompleted calendar event)
    let nextEvent = null;
    let nextEventDay = null;
    for (const day of calData.days) {
      for (const ev of day.events) {
        if (!completedTasks[ev.id] && ev.type !== 'photo') {
          nextEvent = ev;
          nextEventDay = day;
          break;
        }
      }
      if (nextEvent) break;
    }

    const nextActionTimeEl = document.getElementById('dash-next-action-time');
    const nextActionCatEl = document.getElementById('dash-next-action-cat');
    const nextActionEl = document.getElementById('dash-next-action-text');
    const nextActionSubEl = document.getElementById('dash-next-action-sub');

    if (nextEvent && nextEventDay) {
      this.currentHeroEvent = nextEvent;
      const dayLabel = nextEventDay.isToday
        ? 'TODAY'
        : nextEventDay.offset === 1
          ? 'TOMORROW'
          : `${nextEventDay.dayName} ${nextEventDay.dayNumber} ${nextEventDay.monthShort.toUpperCase()}`;

      if (nextActionTimeEl) {
        nextActionTimeEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span><span>UP NEXT • ${dayLabel}</span>`;
      }
      if (nextActionCatEl) nextActionCatEl.innerText = nextEvent.timeLabel;
      if (nextActionEl) nextActionEl.innerText = `${nextEvent.icon} ${nextEvent.title}`;
      if (nextActionSubEl) nextActionSubEl.innerText = nextEvent.subtext;
    } else {
      this.currentHeroEvent = null;
      if (nextActionEl) nextActionEl.innerText = '✨ All caught up for the week!';
      if (nextActionSubEl) nextActionSubEl.innerText = 'Snap a photo anytime if you spot dry patches or weeds.';
    }

    // 3. Photo Check-In Status Card (Complete readable sentences — zero truncation)
    const mascotTipEl = document.getElementById('dash-mascot-tip');
    const photoBadgeEl = document.getElementById('dash-photo-status-badge');
    const scanHistory = StorageManager.getScanHistory(this.activeZoneId);
    if (scanHistory && scanHistory.length > 0) {
      const latest = scanHistory[0];
      if (photoBadgeEl) photoBadgeEl.innerText = `Checked ${this.formatRelativeTime(latest.date)}`;
      if (mascotTipEl) {
        mascotTipEl.innerText = `Tracking at ${latest.healthScore}% health • Snap new photos anytime to update your schedule.`;
      }
    } else {
      if (photoBadgeEl) photoBadgeEl.innerText = 'AI Ready';
      if (mascotTipEl) {
        const areaText = activeZone ? activeZone.name : 'your lawn';
        mascotTipEl.innerText = `Snap a photo of ${areaText} so Blade can update your schedule.`;
      }
    }

    this.renderDashboardWeather();
  },

  rotateMowPattern() {
    this.mowPatternIdx = ((this.mowPatternIdx || 0) + 1) % PlannerEngine.MOW_PATTERNS.length;
    localStorage.setItem('gm_mow_pattern_idx', String(this.mowPatternIdx));
    this.renderDashboard();
    this.renderTasksList();
  },

  completeHeroNextTask() {
    if (!this.currentHeroEvent) {
      this.switchTab('planner');
      return;
    }
    this.handleCalendarEventAction(this.currentHeroEvent.id, this.currentHeroEvent.type);
  },

  renderDashboardWeather() {
    if (!this.weather) return;

    const banner = document.getElementById('dash-rain-alert-banner');
    const verdictEl = document.getElementById('dash-rain-verdict');
    const tempEl = document.getElementById('dash-weather-temp');
    const rainProbEl = document.getElementById('dash-weather-prob');

    if (tempEl) tempEl.innerText = `${this.weather.currentTemp}°C`;
    if (rainProbEl) rainProbEl.innerText = `${this.weather.currentTemp}°C • ${this.weather.maxProb}% Rain`;

    if (banner && verdictEl) {
      verdictEl.innerText = this.weather.rainVerdict;
      if (this.weather.shouldSkipSprinklers) {
        banner.className = 'p-3.5 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-sm flex items-center gap-3 cursor-pointer';
      } else {
        banner.className = 'p-3.5 rounded-2xl bg-emerald-50 text-emerald-900 border border-emerald-200/80 flex items-center gap-3 cursor-pointer';
      }
    }

    const weatherSummaryEl = document.getElementById('weather-summary-text');
    if (weatherSummaryEl) {
      weatherSummaryEl.innerText = this.weather.rainVerdict;
    }
  },

  renderPlannerWeekStrip() {
    // Handled directly inside the Google Calendar Schedule feed
  },

  formatRelativeTime(isoString) {
    if (!isoString) return 'Not yet';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Today';
    if (diffHours < 24) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 14) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },

  logQuickMow() {
    StorageManager.logMow(this.activeZoneId);
    NotificationManager.playTone();
    this.renderDashboard();
    this.renderTasksList();
    const zoneName = this.activeZoneId === 'all' ? 'All Sections' : (StorageManager.getActiveZone()?.name || 'Lawn');
    this.showToast(`✂️ Logged mow for ${zoneName}! Next mow date updated on your calendar.`);
  },

  logQuickWater() {
    StorageManager.logWater(this.activeZoneId);
    NotificationManager.playTone();
    this.renderDashboard();
    this.renderTasksList();
    const zoneName = this.activeZoneId === 'all' ? 'All Sections' : (StorageManager.getActiveZone()?.name || 'Lawn');
    this.showToast(`💧 Logged deep soak for ${zoneName}! Calendar updated.`);
  },

  logQuickFeed() {
    StorageManager.logFeed('Lawn Food', this.activeZoneId);
    NotificationManager.playTone();
    this.renderDashboard();
    this.renderTasksList();
    const zoneName = this.activeZoneId === 'all' ? 'All Sections' : (StorageManager.getActiveZone()?.name || 'Lawn');
    this.showToast(`🌱 Logged lawn food for ${zoneName}! Next feed scheduled in 2 weeks.`);
  },

  getActiveHorizonTasksList(horizon = 'oneWeek') {
    const zones = StorageManager.getZones();
    if (this.activeZoneId !== 'all') {
      const targetZone = zones.find(z => z.id === this.activeZoneId) || zones[0];
      const zRes = targetZone ? this.getSectionAnalysisResult(targetZone.id) : this.currentPlan;
      return zRes?.actionPlan?.[horizon] || [];
    }
    return this.currentPlan?.actionPlan?.[horizon] || [];
  },

  renderPlannerZoneBar() {
    // Top Header Section dropdown is now the single clean selector across the app
  },

  handleCalendarEventAction(eventId, eventType) {
    if (eventType === 'photo') {
      this.switchTab('vision');
      return;
    }

    const isDone = StorageManager.toggleTaskCompleted(eventId);
    if (isDone) {
      NotificationManager.playTone();
      // Also update the "last done" timestamp if completed so the calendar stays in sync
      if (eventType === 'mow') {
        StorageManager.logMow(this.activeZoneId);
      } else if (eventType === 'water') {
        StorageManager.logWater(this.activeZoneId);
      } else if (eventType === 'feed') {
        StorageManager.logFeed('Lawn Food', this.activeZoneId);
      }
      this.showToast('✅ Marked done & updated your calendar!');
    }
    this.renderDashboard();
    this.renderTasksList();
  },

  renderTasksList() {
    const container = document.getElementById('tasks-container');
    if (!container) return;

    const calData = this.getCalendarSchedule();
    const completedTasks = StorageManager.getCompletedTasks();
    const activeZone = StorageManager.getActiveZone();
    const sectionLabel = activeZone ? activeZone.name : 'All Lawn Sections';

    // Update Google Calendar Header (Month Year + Today Icon)
    const todayInfo = calData.days[0];
    const headerDayName = document.getElementById('cal-header-day-name');
    const headerDayNum = document.getElementById('cal-header-day-num');
    const titleEl = document.getElementById('current-horizon-title');
    const subEl = document.getElementById('current-horizon-sub');

    if (todayInfo) {
      if (headerDayName) headerDayName.innerText = todayInfo.dayName;
      if (headerDayNum) headerDayNum.innerText = todayInfo.dayNumber;
      const monthNameCap = todayInfo.monthFull.charAt(0) + todayInfo.monthFull.slice(1).toLowerCase();
      if (titleEl) titleEl.innerText = `${monthNameCap} ${todayInfo.year}`;
    }

    const rangeNames = {
      oneWeek: '7-Day Schedule',
      twoWeeks: 'Fortnight Schedule (14 Days)',
      oneMonth: 'Monthly Schedule (30 Days)'
    };
    if (subEl) {
      subEl.innerText = `${rangeNames[this.activeHorizon] || 'Schedule'} • ${sectionLabel}`;
    }

    // Event card color themes inspired by Google Calendar mobile agenda view
    const themeStyles = {
      emerald: {
        card: 'bg-emerald-600 text-white border-emerald-700 shadow-xs',
        sub: 'text-emerald-100',
        btn: 'bg-white/20 hover:bg-white/30 text-white'
      },
      sky: {
        card: 'bg-sky-600 text-white border-sky-700 shadow-xs',
        sub: 'text-sky-100',
        btn: 'bg-white/20 hover:bg-white/30 text-white'
      },
      teal: {
        card: 'bg-teal-700 text-white border-teal-800 shadow-xs',
        sub: 'text-teal-100',
        btn: 'bg-white/20 hover:bg-white/30 text-white'
      },
      amber: {
        card: 'bg-amber-100 text-amber-950 border-amber-300',
        sub: 'text-amber-800',
        btn: 'bg-amber-900/10 hover:bg-amber-900/20 text-amber-950'
      },
      indigo: {
        card: 'bg-indigo-50 text-indigo-950 border-indigo-200',
        sub: 'text-indigo-700',
        btn: 'bg-indigo-600 text-white hover:bg-indigo-700'
      }
    };

    // Filter to days that are Today, have scheduled events, have an all-day weather banner, or start a new week
    const visibleDays = calData.days.filter(d => d.isToday || d.events.length > 0 || d.allDayBanner);

    container.innerHTML = visibleDays.map(day => {
      const weekDividerHtml = day.weekHeader
        ? `<div class="pt-2 pb-0.5 pl-11 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100">${day.weekHeader}</div>`
        : '';

      const allDayBannerHtml = day.allDayBanner
        ? `<div class="px-2.5 py-1 rounded-lg text-[11px] font-bold ${day.isRainy ? 'bg-amber-300/90 text-slate-900' : 'bg-slate-100 text-slate-700'}">
             ${day.allDayBanner}
           </div>`
        : '';

      const eventsHtml = day.events.map(ev => {
        const isDone = !!completedTasks[ev.id];
        const st = themeStyles[ev.color] || themeStyles.emerald;

        if (isDone) {
          return `
            <div onclick="App.handleCalendarEventAction('${ev.id}', '${ev.type}')" class="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 flex items-center justify-between gap-2 cursor-pointer transition-all">
              <div class="flex-1">
                <div class="text-xs font-bold line-through leading-snug">${ev.icon} ${ev.title}</div>
                <div class="text-[10px] line-through leading-snug">${ev.timeLabel} • Completed</div>
              </div>
              <span class="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-bold shrink-0">✓ Done</span>
            </div>
          `;
        }

        const actionLabel = ev.type === 'photo' ? '📸 Snap' : '✓ Done';
        const deleteBtnHtml = ev.userEntryId
          ? `<button type="button" onclick="event.stopPropagation(); App.deleteUserCalendarEntry('${ev.userEntryId}')" class="px-2 py-1 rounded-lg text-[10px] font-bold bg-black/15 hover:bg-black/25 text-white shrink-0" title="Delete Entry">✕</button>`
          : '';

        return `
          <div onclick="App.handleCalendarEventAction('${ev.id}', '${ev.type}')" class="p-2.5 rounded-xl border ${st.card} flex items-center justify-between gap-2 cursor-pointer transition-all btn-press">
            <div class="flex-1">
              <div class="text-xs font-extrabold leading-snug">${ev.icon} ${ev.title}</div>
              <div class="text-[10px] font-medium ${st.sub} mt-0.5 leading-snug">${ev.timeLabel} • ${ev.subtext}</div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" class="px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${st.btn}">
                ${actionLabel}
              </button>
              ${deleteBtnHtml}
            </div>
          </div>
        `;
      }).join('');

      return `
        ${weekDividerHtml}
        <div class="flex items-start gap-2.5">
          <!-- Left Column: Google Calendar Day Name & Date Circle -->
          <div class="w-9 flex-shrink-0 text-center pt-0.5 select-none">
            <span class="text-[9px] font-bold uppercase block ${day.isToday ? 'text-blue-600' : 'text-slate-500'}">${day.dayName}</span>
            ${day.isToday
              ? `<div class="w-7 h-7 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center mx-auto mt-0.5 shadow-2xs">${day.dayNumber}</div>`
              : `<div class="text-sm font-bold text-slate-800 leading-tight mt-0.5">${day.dayNumber}</div>`
            }
          </div>

          <!-- Right Column: All-Day Banner + Timed Event Blocks -->
          <div class="flex-1 min-w-0 space-y-1.5">
            ${allDayBannerHtml}
            ${eventsHtml}
          </div>
        </div>
      `;
    }).join('');

    NotificationManager.checkAndFireCalendarReminders(calData.days, completedTasks);

    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  handleTaskToggle(taskId) {
    this.handleCalendarEventAction(taskId, 'task');
  },

  /* ------------------- INSTANT DOSAGE & SPREADER CALCULATOR ------------------- */

  openDosageCalculator(zoneId = null, productType = 'foliar') {
    const modal = document.getElementById('dosage-calc-modal');
    const zoneSelect = document.getElementById('calc-zone-select');
    const productSelect = document.getElementById('calc-product-select');
    const areaInput = document.getElementById('calc-area-input');
    if (!modal) return;

    const zones = StorageManager.getZones();
    const totalArea = zones.reduce((s, z) => s + (Number(z.area) || 50), 0);
    const targetZoneId = zoneId || this.activeZoneId || 'all';

    if (zoneSelect) {
      zoneSelect.innerHTML = `
        <option value="all" ${targetZoneId === 'all' ? 'selected' : ''}>🌿 Entire Property (${totalArea}m²)</option>
        ${zones.map(z => `<option value="${z.id}" ${targetZoneId === z.id ? 'selected' : ''}>📍 ${z.name} (${z.area || 50}m²)</option>`).join('')}
      `;
    }

    if (productSelect && productType) {
      productSelect.value = productType;
    }

    if (areaInput) {
      if (targetZoneId === 'all') {
        areaInput.value = totalArea;
      } else {
        const z = zones.find(item => item.id === targetZoneId);
        areaInput.value = z ? (z.area || 50) : 90;
      }
    }

    this.updateDosageCalculation();
    modal.classList.remove('hidden');
    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  closeDosageCalculator() {
    const modal = document.getElementById('dosage-calc-modal');
    if (modal) modal.classList.add('hidden');
  },

  handleCalcZoneChange(zoneId) {
    const zones = StorageManager.getZones();
    const areaInput = document.getElementById('calc-area-input');
    if (!areaInput) return;

    if (zoneId === 'all') {
      areaInput.value = zones.reduce((s, z) => s + (Number(z.area) || 50), 0);
    } else {
      const z = zones.find(item => item.id === zoneId);
      if (z) areaInput.value = z.area || 50;
    }
    this.updateDosageCalculation();
  },

  updateDosageCalculation() {
    const productSelect = document.getElementById('calc-product-select');
    const areaInput = document.getElementById('calc-area-input');
    const prodAmtEl = document.getElementById('calc-result-product');
    const waterAmtEl = document.getElementById('calc-result-water');
    const rateSubEl = document.getElementById('calc-result-rate');
    const tipEl = document.getElementById('calc-result-tip');

    const type = productSelect ? productSelect.value : 'foliar';
    const areaM2 = Math.max(5, parseInt(areaInput?.value || '90', 10) || 90);
    const res = PlannerEngine.calculateDosage(type, areaM2);

    if (prodAmtEl) prodAmtEl.innerText = res.productAmount;
    if (waterAmtEl) waterAmtEl.innerText = res.waterAmount;
    if (rateSubEl) rateSubEl.innerText = `Rate: ${res.rateLabel} for ${areaM2}m²`;
    if (tipEl) tipEl.innerText = res.instructions;
  },

  logFromCalculator() {
    const zoneSelect = document.getElementById('calc-zone-select');
    const productSelect = document.getElementById('calc-product-select');
    const zId = zoneSelect ? zoneSelect.value : this.activeZoneId;
    const type = productSelect ? productSelect.value : 'foliar';
    const res = PlannerEngine.calculateDosage(type, 100);

    StorageManager.logFeed(res.title, zId);
    NotificationManager.playTone();
    this.closeDosageCalculator();
    this.renderDashboard();
    this.showToast(`✅ Logged ${res.title}!`);
  },

  /* ------------------- MULTI-PHOTO STAGING & ANALYSIS ------------------- */

  getActiveStagedPhotos() {
    const zoneId = this.scanTargetZoneId || 'default';
    if (!this.stagedPhotosByZone[zoneId]) {
      this.stagedPhotosByZone[zoneId] = [];
    }
    return this.stagedPhotosByZone[zoneId];
  },

  handlePhotosSelected(e) {
    if (e.target.files && e.target.files.length > 0) {
      this.processSelectedFiles(e.target.files);
      e.target.value = '';
    }
  },

  async processSelectedFiles(fileList) {
    const photos = this.getActiveStagedPhotos();
    const files = Array.from(fileList);

    for (const file of files) {
      if (photos.length >= 8) {
        this.showToast('Maximum 8 photos per section scan.');
        break;
      }
      try {
        const compressedUrl = await VisionEngine.compressPhotoFile(file);
        photos.push(compressedUrl);
      } catch (err) {
        console.warn('Image load error:', err);
      }
    }

    this.renderVisionZoneSelector();
    this.renderStagedPhotosUI();
  },

  removeStagedPhoto(idx) {
    const photos = this.getActiveStagedPhotos();
    photos.splice(idx, 1);
    this.renderVisionZoneSelector();
    this.renderStagedPhotosUI();
  },

  clearStagedPhotos() {
    const zoneId = this.scanTargetZoneId || 'default';
    this.stagedPhotosByZone[zoneId] = [];
    this.renderVisionZoneSelector();
    this.renderStagedPhotosUI();
  },

  renderStagedPhotosUI() {
    const container = document.getElementById('staged-photos-container');
    const analyzeBtn = document.getElementById('multi-scan-submit-btn');
    const emptyPrompt = document.getElementById('staged-empty-prompt');
    const countBadge = document.getElementById('staged-photo-count');
    const clearRow = document.getElementById('staged-clear-row');

    const photos = this.getActiveStagedPhotos();
    const stagedZoneIds = Object.keys(this.stagedPhotosByZone || {}).filter(
      zId => Array.isArray(this.stagedPhotosByZone[zId]) && this.stagedPhotosByZone[zId].length > 0
    );
    const totalStagedPhotos = stagedZoneIds.reduce((acc, zId) => acc + this.stagedPhotosByZone[zId].length, 0);

    if (countBadge) {
      countBadge.innerText = `${photos.length} Photo${photos.length === 1 ? '' : 's'} in Section`;
    }

    if (analyzeBtn) {
      if (totalStagedPhotos > 0) {
        analyzeBtn.classList.remove('hidden');
        const btnSpan = analyzeBtn.querySelector('span');
        if (btnSpan) {
          btnSpan.innerText = stagedZoneIds.length > 1
            ? `Analyze ${totalStagedPhotos} Photos Across ${stagedZoneIds.length} Yard Sections →`
            : `Analyze ${totalStagedPhotos} Photo${totalStagedPhotos === 1 ? '' : 's'} & Detect Hotspots →`;
        }
      } else {
        analyzeBtn.classList.add('hidden');
      }
    }

    if (!container) return;

    if (photos.length === 0) {
      container.innerHTML = '';
      if (emptyPrompt) emptyPrompt.classList.remove('hidden');
      if (clearRow) clearRow.classList.add('hidden');
      return;
    }

    if (emptyPrompt) emptyPrompt.classList.add('hidden');
    if (clearRow) clearRow.classList.remove('hidden');

    const photoLabels = [
      'Wide Angle Overview',
      'Problem Patch 1',
      'Problem Patch 2',
      'Close-up Cut Quality',
      'Edge / Weed Spot',
      'Angle 6',
      'Angle 7',
      'Angle 8'
    ];

    container.innerHTML = photos.map((src, idx) => `
      <div class="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group shadow-2xs flex flex-col">
        <img src="${src}" class="w-full h-14 object-cover" alt="Angle ${idx + 1}">
        <div class="px-1.5 py-1 bg-white text-[9px] font-semibold text-slate-700 flex items-center justify-between gap-1">
          <span>${photoLabels[idx] || `Angle ${idx + 1}`}</span>
          <button type="button" onclick="App.removeStagedPhoto(${idx})" class="w-4 h-4 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center font-bold text-[10px] flex-shrink-0">✕</button>
        </div>
      </div>
    `).join('');
  },

  /* ------------------- BLADE AI CHAT, WEED / PATCH Q&A & PHOTO CHECK-IN ------------------- */

  getBladeChatMessages() {
    if (!this.bladeChatMessages) {
      try {
        const saved = localStorage.getItem('gm_blade_chat_history');
        if (saved) {
          this.bladeChatMessages = JSON.parse(saved);
        }
      } catch (e) {
        this.bladeChatMessages = null;
      }
    }
    if (!Array.isArray(this.bladeChatMessages) || this.bladeChatMessages.length === 0) {
      const activeZone = StorageManager.getActiveZone();
      const zName = activeZone ? `${activeZone.name} (${activeZone.grassType})` : 'All Lawn Sections';
      this.bladeChatMessages = [
        {
          role: 'blade',
          html: `
            <div class="space-y-1.5">
              <div>G'day! I'm <strong>Blade AI</strong> 🌱 — currently viewing <strong>${zName}</strong>.</div>
              <div>• <strong>Snap or attach photos</strong> using the 📷 or 🖼️ buttons below.</div>
              <div>• <strong>Ask me anything:</strong> <em>"What is this weed?"</em>, <em>"How do I get rid of this?"</em>, <em>"Why is this patch brown?"</em>, or tap <strong>Log photo to Calendar</strong>!</div>
            </div>
          `,
          calendarTask: null
        }
      ];
    }
    return this.bladeChatMessages;
  },

  saveBladeChatMessages() {
    try {
      // Keep the most recent 12 messages (without large data URLs in localStorage to save quota)
      const compact = (this.bladeChatMessages || []).slice(-12).map(m => ({
        ...m,
        photos: Array.isArray(m.photos) ? m.photos.slice(0, 2) : []
      }));
      localStorage.setItem('gm_blade_chat_history', JSON.stringify(compact));
    } catch (e) {
      // Ignore storage quota if photos are large
    }
  },

  clearBladeChat() {
    this.bladeChatMessages = null;
    localStorage.removeItem('gm_blade_chat_history');
    this.renderBladeChat();
    this.showToast('✨ Blade AI chat cleared!');
  },

  renderBladeChat() {
    const feed = document.getElementById('blade-chat-feed');
    if (!feed) return;
    const msgs = this.getBladeChatMessages();

    feed.innerHTML = msgs.map((m, idx) => {
      if (m.role === 'user') {
        const photosHtml = Array.isArray(m.photos) && m.photos.length > 0
          ? `<div class="grid grid-cols-2 gap-1.5 mb-1.5">
               ${m.photos.map(src => `<img src="${src}" class="w-full h-20 object-cover rounded-lg border border-white/25">`).join('')}
             </div>`
          : '';
        return `
          <div class="flex justify-end">
            <div class="max-w-[85%] bg-emerald-600 text-white px-3 py-2 rounded-2xl rounded-br-sm text-xs shadow-2xs">
              ${photosHtml}
              <div class="font-medium leading-snug">${m.text || '📸 Attached lawn photo(s)'}</div>
            </div>
          </div>
        `;
      }

      const taskBtnHtml = m.calendarTask
        ? `<div class="mt-2 pt-2 border-t border-slate-200/80 flex items-center gap-2">
             <button type="button" onclick="App.addBladeTaskToCalendar(${idx})" class="w-full py-2 px-3 rounded-xl text-[11px] font-extrabold transition-all btn-press flex items-center justify-center gap-1.5 ${m.addedToCalendar ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'}">
               <span>${m.addedToCalendar ? '✓ Added to Your Calendar' : `📅 Add "${m.calendarTask.title}" to Calendar`}</span>
             </button>
           </div>`
        : '';

      return `
        <div class="flex items-start gap-2">
          <div class="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-extrabold flex-shrink-0 mt-0.5">
            🌱
          </div>
          <div class="flex-1 bg-slate-50 border border-slate-200/90 text-slate-800 p-3 rounded-2xl rounded-tl-sm text-xs leading-relaxed">
            ${m.html}
            ${taskBtnHtml}
          </div>
        </div>
      `;
    }).join('');

    feed.scrollTop = feed.scrollHeight;
  },

  sendQuickBladePrompt(promptText) {
    const input = document.getElementById('blade-chat-input');
    if (input) input.value = promptText;
    this.sendBladeChatMessage();
  },

  async sendBladeChatMessage() {
    const input = document.getElementById('blade-chat-input');
    const question = input ? input.value.trim() : '';
    const stagedPhotos = [...this.getActiveStagedPhotos()];

    if (!question && stagedPhotos.length === 0) {
      this.showToast('📸 Snap/attach a photo or type a question for Blade first!');
      return;
    }

    if (input) input.value = '';
    this.clearStagedPhotos();

    const msgs = this.getBladeChatMessages();
    msgs.push({
      role: 'user',
      text: question || `📸 Log ${stagedPhotos.length} lawn photo${stagedPhotos.length === 1 ? '' : 's'} & analyze`,
      photos: stagedPhotos
    });
    this.renderBladeChat();

    const laser = document.getElementById('scanner-laser');
    if (laser && stagedPhotos.length > 0) laser.classList.remove('hidden');

    try {
      const activeZone = StorageManager.getActiveZone();
      const targetZoneId = activeZone ? activeZone.id : (StorageManager.getZones()[0]?.id || 'front_main');
      const settings = StorageManager.getSettings();

      const aiRes = await VisionEngine.askBladeAI({
        question,
        photos: stagedPhotos,
        activeZone,
        profile: this.profile,
        weather: this.weather,
        tapTimer: StorageManager.getTapTimer(),
        apiKey: settings.apiKey
      });

      // Automatically log any uploaded photo scan to update Health Score & Calendar
      if (aiRes.photoAnalysis) {
        const record = StorageManager.saveScanResult(aiRes.photoAnalysis, targetZoneId);
        this.latestZoneScanResults[targetZoneId] = record;
        this.currentPlan = {
          date: new Date().toISOString(),
          ...aiRes.photoAnalysis
        };
        StorageManager.saveActivePlan(this.currentPlan);
      }

      msgs.push({
        role: 'blade',
        html: aiRes.replyHtml,
        calendarTask: aiRes.calendarTask || null,
        addedToCalendar: false
      });

      this.saveBladeChatMessages();
      this.renderBladeChat();
      this.renderHeader();
      this.renderDashboard();
      this.renderTasksList();
      this.renderHistory();
    } catch (err) {
      console.error('Blade AI chat error:', err);
      msgs.push({
        role: 'blade',
        html: 'I had a hiccup reading that photo—please try again or ask your question below!',
        calendarTask: null
      });
      this.renderBladeChat();
    } finally {
      if (laser) laser.classList.add('hidden');
    }
  },

  addBladeTaskToCalendar(msgIdx) {
    const msgs = this.getBladeChatMessages();
    const m = msgs[msgIdx];
    if (!m || !m.calendarTask) return;

    try {
      const raw = localStorage.getItem('gm_blade_custom_events');
      const list = raw ? JSON.parse(raw) : [];
      list.push({
        ...m.calendarTask,
        addedAt: new Date().toISOString()
      });
      localStorage.setItem('gm_blade_custom_events', JSON.stringify(list));
    } catch (e) {
      console.warn('Could not save custom event:', e);
    }

    m.addedToCalendar = true;
    this.saveBladeChatMessages();
    this.renderBladeChat();
    this.renderDashboard();
    this.renderTasksList();
    this.showToast(`📅 Added "${m.calendarTask.title}" to your Calendar!`);
  },

  /* ------------------- ONBOARDING STEP 5: PER-SECTION PHOTO LIBRARY & CAMERA ------------------- */

  renderOnboardingPhotoSectionSelect() {
    const select = document.getElementById('ob-photo-section-select');
    if (!select) return;
    const zones = this.consultationData.zones || StorageManager.getZones();
    if (!zones || zones.length === 0) return;

    if (!this.consultationData.currentPhotoZoneId || !zones.some(z => z.id === this.consultationData.currentPhotoZoneId)) {
      this.consultationData.currentPhotoZoneId = zones[0].id;
    }
    if (!this.consultationData.zonePhotos) {
      this.consultationData.zonePhotos = {};
    }

    select.innerHTML = zones.map(z => {
      const count = (this.consultationData.zonePhotos[z.id] || []).length;
      const badge = z.attentionLevel === 'showpiece' ? '⭐ Showpiece' : z.attentionLevel === 'recovery' ? '🔥 Recovery' : '🌿 Standard';
      return `
        <option value="${z.id}" ${this.consultationData.currentPhotoZoneId === z.id ? 'selected' : ''}>
          🌱 ${z.name} (${badge})${count > 0 ? ` — ${count} photo${count === 1 ? '' : 's'}` : ''}
        </option>
      `;
    }).join('');

    this.renderOnboardingPhotosPreview();
  },

  handleOnboardingPhotoZoneChange(newZoneId) {
    this.consultationData.currentPhotoZoneId = newZoneId;
    this.renderOnboardingPhotosPreview();
  },

  async handleOnboardingPhotosSelected(e) {
    if (!e.target.files || e.target.files.length === 0) return;

    const zones = this.consultationData.zones || StorageManager.getZones();
    const zoneId = this.consultationData.currentPhotoZoneId || (zones[0] ? zones[0].id : 'front_main');
    if (!this.consultationData.zonePhotos) this.consultationData.zonePhotos = {};
    if (!this.consultationData.zonePhotos[zoneId]) this.consultationData.zonePhotos[zoneId] = [];

    const targetList = this.consultationData.zonePhotos[zoneId];
    const files = Array.from(e.target.files);
    e.target.value = '';

    for (const file of files) {
      if (targetList.length >= 8) {
        this.showToast('Maximum 8 photos per lawn section.');
        break;
      }
      try {
        const compressed = await VisionEngine.compressPhotoFile(file);
        targetList.push(compressed);
      } catch (err) {
        console.warn('Onboarding image load error:', err);
      }
    }

    this.renderOnboardingPhotoSectionSelect();
    this.showToast(`Added ${files.length} photo${files.length === 1 ? '' : 's'}!`);
  },

  removeOnboardingPhoto(zoneId, idx) {
    if (this.consultationData.zonePhotos && this.consultationData.zonePhotos[zoneId]) {
      this.consultationData.zonePhotos[zoneId].splice(idx, 1);
      this.renderOnboardingPhotoSectionSelect();
    }
  },

  renderOnboardingPhotosPreview() {
    const container = document.getElementById('ob-photos-preview-grid');
    const statusText = document.getElementById('ob-photo-status');
    const summaryEl = document.getElementById('ob-photos-summary-badges');

    const zones = this.consultationData.zones || StorageManager.getZones();
    const zoneId = this.consultationData.currentPhotoZoneId || (zones[0] ? zones[0].id : 'front_main');
    const currentZone = zones.find(z => z.id === zoneId);
    const zoneName = currentZone ? currentZone.name : 'this section';

    if (!this.consultationData.zonePhotos) this.consultationData.zonePhotos = {};
    const photos = this.consultationData.zonePhotos[zoneId] || [];

    if (statusText) {
      if (photos.length === 0) {
        statusText.innerText = `Tap to Choose Photos for ${zoneName} (Multi-Select)`;
      } else {
        statusText.innerText = `${photos.length} photo${photos.length === 1 ? '' : 's'} attached for ${zoneName}! Tap to add more.`;
      }
    }

    if (container) {
      const labels = ['Wide View', 'Patch 2', 'Patch 3', 'Close-up', 'Edge 5', 'Angle 6', 'Angle 7', 'Angle 8'];
      container.innerHTML = photos.map((src, idx) => `
        <div class="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs">
          <img src="${src}" class="w-full h-16 object-cover" alt="${zoneName} photo ${idx + 1}">
          <button type="button" onclick="App.removeOnboardingPhoto('${zoneId}', ${idx})" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/70 text-white hover:bg-rose-600 flex items-center justify-center text-[10px] font-bold">✕</button>
          <span class="block text-[9px] font-semibold text-slate-700 bg-white/95 px-1.5 py-0.5 text-center">${labels[idx] || `Photo ${idx + 1}`}</span>
        </div>
      `).join('');
    }

    if (summaryEl) {
      const zonesWithPhotos = zones.filter(z => (this.consultationData.zonePhotos[z.id] || []).length > 0);
      if (zonesWithPhotos.length > 0) {
        summaryEl.classList.remove('hidden');
        summaryEl.innerHTML = zonesWithPhotos.map(z => {
          const cnt = this.consultationData.zonePhotos[z.id].length;
          return `
            <button type="button" onclick="App.handleOnboardingPhotoZoneChange('${z.id}'); document.getElementById('ob-photo-section-select').value='${z.id}';" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold ${z.id === zoneId ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}">
              <span>📸 ${z.name}: ${cnt}</span>
            </button>
          `;
        }).join('');
      } else {
        summaryEl.innerHTML = '';
        summaryEl.classList.add('hidden');
      }
    }
  },

  loadDemoTurf(type) {
    const dataUrl = VisionEngine.createDemoTurfImage(type);
    const zoneId = this.scanTargetZoneId || 'default';
    this.stagedPhotosByZone[zoneId] = [dataUrl];
    this.renderVisionZoneSelector();
    this.renderStagedPhotosUI();
    this.triggerMultiPhotoAnalysis();
  },

  async triggerMultiPhotoAnalysis() {
    const zones = StorageManager.getZones();
    const stagedZoneIds = Object.keys(this.stagedPhotosByZone || {}).filter(
      zId => Array.isArray(this.stagedPhotosByZone[zId]) && this.stagedPhotosByZone[zId].length > 0
    );

    if (stagedZoneIds.length === 0) {
      this.showToast('Please add at least 1 photo to inspect.');
      return;
    }

    this.isScanning = true;
    const laser = document.getElementById('scanner-laser');
    if (laser) laser.classList.remove('hidden');

    try {
      const settings = StorageManager.getSettings();
      let primaryResult = null;
      let primaryZone = null;

      // Ensure active scanTargetZoneId is analyzed and shown first if it has photos
      const orderedZoneIds = stagedZoneIds.includes(this.scanTargetZoneId)
        ? [this.scanTargetZoneId, ...stagedZoneIds.filter(id => id !== this.scanTargetZoneId)]
        : stagedZoneIds;

      for (const zId of orderedZoneIds) {
        const photos = this.stagedPhotosByZone[zId];
        const targetZone = zones.find(z => z.id === zId) || zones[0];
        const result = await VisionEngine.analyzeMultipleImages(photos, this.profile, targetZone, settings.apiKey);
        const enrichedResult = {
          ...result,
          zoneId: targetZone ? targetZone.id : zId,
          isPhotoScan: true
        };

        if (targetZone) {
          this.latestZoneScanResults[targetZone.id] = enrichedResult;
          StorageManager.addScanRecord(enrichedResult, targetZone.id);
        }

        if (!primaryResult) {
          primaryResult = enrichedResult;
          primaryZone = targetZone;
        }
      }

      if (primaryResult) {
        this.currentPlan = {
          date: new Date().toISOString(),
          ...primaryResult
        };
        StorageManager.saveActivePlan(this.currentPlan);
      }

      setTimeout(() => {
        this.isScanning = false;
        if (laser) laser.classList.add('hidden');
        this.stagedPhotosByZone = {};
        this.renderVisionZoneSelector();
        this.renderStagedPhotosUI();
        this.renderAll();
        if (primaryResult) {
          this.showScanResultModal(primaryResult, primaryZone);
        }
        NotificationManager.playTone();
      }, 1200);

    } catch (e) {
      console.error('Vision analysis error', e);
      this.isScanning = false;
      if (laser) laser.classList.add('hidden');
      this.showToast('Analysis error. Please try another photo.');
    }
  },

  openSectionAnalysisModal(zoneId = null) {
    const zones = StorageManager.getZones();
    const targetZoneId = (zoneId && zoneId !== 'all' && zones.some(z => z.id === zoneId))
      ? zoneId
      : (this.activeZoneId !== 'all' && zones.some(z => z.id === this.activeZoneId))
      ? this.activeZoneId
      : (zones[0] ? zones[0].id : null);

    const targetZone = zones.find(z => z.id === targetZoneId) || zones[0];
    const result = targetZone ? this.getSectionAnalysisResult(targetZone.id) : this.currentPlan;
    this.showScanResultModal(result, targetZone);
  },

  handleModalSectionChange(zoneId) {
    const zones = StorageManager.getZones();
    const targetZone = zones.find(z => z.id === zoneId) || zones[0];
    if (!targetZone) return;

    this.modalViewingZoneId = targetZone.id;
    const result = this.getSectionAnalysisResult(targetZone.id);

    // Sync active zone & currentPlan so clicking "Apply to Action Planner" applies this section's plan
    this.activeZoneId = targetZone.id;
    StorageManager.setActiveZoneId(targetZone.id);
    if (result) {
      this.currentPlan = {
        date: result.date || new Date().toISOString(),
        ...result
      };
    }
    this.renderHeader();
    this.renderZoneBar();
    this.renderDashboard();
    this.renderTasksList();

    this.showScanResultModal(result, targetZone);
  },

  jumpToScanModalSection() {
    const targetId = this.modalViewingZoneId || (StorageManager.getZones()[0]?.id);
    const modal = document.getElementById('scan-result-modal');
    if (modal) modal.classList.add('hidden');
    if (targetId) {
      this.scanTargetZoneId = targetId;
      this.activeZoneId = targetId;
      StorageManager.setActiveZoneId(targetId);
    }
    this.switchTab('vision');
    this.renderVisionZoneSelector();
    this.renderStagedPhotosUI();
  },

  showScanResultModal(result = null, zoneInfo = null) {
    const zones = StorageManager.getZones();
    let targetZone = zoneInfo;
    if (!targetZone) {
      const fallbackId = this.modalViewingZoneId || (this.activeZoneId !== 'all' ? this.activeZoneId : (zones[0]?.id));
      targetZone = zones.find(z => z.id === fallbackId) || zones[0];
    }

    if (targetZone) {
      this.modalViewingZoneId = targetZone.id;
      if (result && result.isPhotoScan !== false && result.photoCount > 0) {
        this.latestZoneScanResults[targetZone.id] = result;
      }
    }

    const activeResult = result || (targetZone ? this.getSectionAnalysisResult(targetZone.id) : this.currentPlan);
    if (!activeResult) return;

    const verdictEl = document.getElementById('modal-verdict');
    const healthEl = document.getElementById('modal-health');
    const densityEl = document.getElementById('modal-density');
    const dgciEl = document.getElementById('modal-dgci');
    const weedEl = document.getElementById('modal-weed');
    const stressEl = document.getElementById('modal-stress');
    const hotspotsListEl = document.getElementById('modal-hotspots-list');
    const modalSectionName = document.getElementById('modal-section-name');
    const modalSelect = document.getElementById('modal-section-select');
    const modalPills = document.getElementById('modal-section-pills');
    const modalCountBadge = document.getElementById('modal-section-count-badge');
    const scanMoreBtnText = document.getElementById('modal-scan-more-btn-text');

    if (modalCountBadge) {
      const scannedCount = zones.filter(z => {
        const r = this.latestZoneScanResults[z.id] || StorageManager.getZonePlan(z.id);
        return r && r.isPhotoScan !== false && r.photoCount > 0;
      }).length;
      modalCountBadge.innerText = scannedCount > 0
        ? `${scannedCount}/${zones.length} Photo Scanned`
        : `${zones.length} Yard Area${zones.length === 1 ? '' : 's'}`;
    }

    if (modalSelect && zones.length > 0) {
      modalSelect.innerHTML = zones.map(z => {
        const zRes = this.latestZoneScanResults[z.id] || StorageManager.getZonePlan(z.id);
        const hasPhoto = zRes && zRes.isPhotoScan !== false && zRes.photoCount > 0;
        const pCount = hasPhoto ? zRes.photoCount : 0;
        const labelSuffix = hasPhoto
          ? `📸 ${pCount} photo${pCount === 1 ? '' : 's'} (${zRes.healthScore}% Health)`
          : `🌱 Profile Baseline (${z.hoc}mm)`;
        return `
          <option value="${z.id}" ${targetZone && targetZone.id === z.id ? 'selected' : ''}>
            ${z.name} — ${labelSuffix}
          </option>
        `;
      }).join('');
    }

    if (modalPills && zones.length > 0) {
      modalPills.innerHTML = zones.map(z => {
        const zRes = this.latestZoneScanResults[z.id] || StorageManager.getZonePlan(z.id);
        const hasPhoto = zRes && zRes.isPhotoScan !== false && zRes.photoCount > 0;
        const isSelected = targetZone && targetZone.id === z.id;
        return `
          <button type="button" onclick="App.handleModalSectionChange('${z.id}')" class="px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1 flex-shrink-0 ${isSelected ? 'bg-emerald-600 text-white shadow-sm' : hasPhoto ? 'bg-white text-emerald-800 border border-emerald-300 hover:bg-emerald-100' : 'bg-white/80 text-slate-600 border border-slate-200 hover:bg-white'}">
            <span>${hasPhoto ? '📸' : '🌱'} ${z.name}</span>
            ${hasPhoto ? `<span class="text-[9px] px-1 rounded ${isSelected ? 'bg-emerald-800 text-white' : 'bg-emerald-100 text-emerald-800'}">${zRes.healthScore}%</span>` : ''}
          </button>
        `;
      }).join('');
    }

    const pCount = activeResult.photoCount || 0;
    const isPhotoScan = activeResult.isPhotoScan !== false && pCount > 0;

    if (modalSectionName) {
      if (targetZone) {
        const scanTag = isPhotoScan
          ? `${pCount} photo${pCount === 1 ? '' : 's'} scanned`
          : `Agronomic Baseline`;
        modalSectionName.innerText = `${targetZone.name} • ${scanTag} • ${targetZone.hoc}mm`;
      } else {
        modalSectionName.innerText = `Composite Turf Scan (${pCount} photo${pCount === 1 ? '' : 's'})`;
      }
    }

    if (scanMoreBtnText && targetZone) {
      scanMoreBtnText.innerText = isPhotoScan
        ? `Add / Update Photos for ${targetZone.name}`
        : `Snap / Upload Photos for ${targetZone.name}`;
    }

    if (verdictEl) verdictEl.innerText = activeResult.overallVerdict;
    if (healthEl) healthEl.innerText = `${activeResult.healthScore}%`;
    if (densityEl) densityEl.innerText = `${activeResult.densityScore}%`;
    if (dgciEl) dgciEl.innerText = `${activeResult.darkGreenColorIndex}/100`;
    if (weedEl) weedEl.innerText = activeResult.weedPressure;
    if (stressEl) stressEl.innerText = activeResult.diseaseOrStress;

    if (hotspotsListEl) {
      if (activeResult.hotspots && activeResult.hotspots.length > 0) {
        hotspotsListEl.innerHTML = `
          <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
            <span class="font-bold flex items-center gap-1">⚠️ Pinpointed Micro-Problems:</span>
            ${activeResult.hotspots.map(h => `
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
    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
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
        this.consultationData.currentAuditingZoneId = null;
        this.consultationData.zoneHistory = {};
        this.consultationData.currentPhotoZoneId = null;
        this.consultationData.zonePhotos = {};
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
    } else if (this.onboardingStep === 4) {
      this.renderHistorySectionSelect();
    } else if (this.onboardingStep === 5) {
      this.renderOnboardingPhotoSectionSelect();
    } else if (this.onboardingStep === 6) {
      this.renderConsultationSummary();
    }

    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  renderHistorySectionSelect() {
    const select = document.getElementById('ob-history-section-select');
    if (!select) return;
    const zones = this.consultationData.zones || StorageManager.getZones();
    if (!zones || zones.length === 0) return;

    if (!this.consultationData.currentAuditingZoneId) {
      this.consultationData.currentAuditingZoneId = zones[0].id;
    }

    select.innerHTML = zones.map(z => `
      <option value="${z.id}" ${this.consultationData.currentAuditingZoneId === z.id ? 'selected' : ''}>
        🌱 ${z.name} (${z.attentionLevel === 'showpiece' ? '⭐ Showpiece' : z.attentionLevel === 'recovery' ? '🔥 Recovery' : '🌿 Standard'} • ${z.hoc}mm)
      </option>
    `).join('');

    this.loadZoneHistoryToForm(this.consultationData.currentAuditingZoneId);
  },

  handleHistorySectionChange(newZoneId) {
    this.saveCurrentZoneHistoryFromForm();
    this.consultationData.currentAuditingZoneId = newZoneId;
    this.loadZoneHistoryToForm(newZoneId);

    const zones = this.consultationData.zones || [];
    const z = zones.find(item => item.id === newZoneId);
    if (z) {
      this.showToast(`Auditing history for "${z.name}"`);
    }
  },

  saveCurrentZoneHistoryFromForm() {
    const currentId = this.consultationData.currentAuditingZoneId;
    if (!currentId) return;

    const data = {
      lastMowDays: Number(document.getElementById('ob-last-mow')?.value || 3),
      lastFertDays: Number(document.getElementById('ob-last-fert')?.value || 14),
      lastFertType: document.getElementById('ob-fert-type')?.value || 'Liquid Foliar',
      preEmergentStatus: document.getElementById('ob-pre-emergent')?.value || 'none',
      lastRenovation: document.getElementById('ob-renovation')?.value || 'last_year'
    };

    if (!this.consultationData.zoneHistory) {
      this.consultationData.zoneHistory = {};
    }

    this.consultationData.zoneHistory[currentId] = data;

    // If 'Same for all' is checked, copy to all sections
    const syncAll = document.getElementById('ob-sync-all-sections')?.checked;
    if (syncAll && this.consultationData.zones) {
      this.consultationData.zones.forEach(z => {
        this.consultationData.zoneHistory[z.id] = { ...data };
      });
    }
  },

  loadZoneHistoryToForm(zoneId) {
    if (!this.consultationData.zoneHistory) {
      this.consultationData.zoneHistory = {};
    }

    const data = this.consultationData.zoneHistory[zoneId] || {
      lastMowDays: this.consultationData.lastMowDays || 3,
      lastFertDays: this.consultationData.lastFertDays || 14,
      lastFertType: this.consultationData.lastFertType || 'Liquid Foliar',
      preEmergentStatus: this.consultationData.preEmergentStatus || 'none',
      lastRenovation: this.consultationData.lastRenovation || 'last_year'
    };

    const mowSelect = document.getElementById('ob-last-mow');
    const fertSelect = document.getElementById('ob-last-fert');
    const fertTypeSelect = document.getElementById('ob-fert-type');
    const preEmSelect = document.getElementById('ob-pre-emergent');
    const renovSelect = document.getElementById('ob-renovation');

    if (mowSelect) mowSelect.value = String(data.lastMowDays);
    if (fertSelect) fertSelect.value = String(data.lastFertDays);
    if (fertTypeSelect) fertTypeSelect.value = data.lastFertType;
    if (preEmSelect) preEmSelect.value = data.preEmergentStatus;
    if (renovSelect) renovSelect.value = data.lastRenovation;
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
      this.saveCurrentZoneHistoryFromForm();
      const currentId = this.consultationData.currentAuditingZoneId || (this.consultationData.zones && this.consultationData.zones[0]?.id);
      const hist = (this.consultationData.zoneHistory && currentId) ? this.consultationData.zoneHistory[currentId] : null;

      this.consultationData.lastMowDays = hist ? hist.lastMowDays : Number(document.getElementById('ob-last-mow')?.value || 3);
      this.consultationData.lastFertDays = hist ? hist.lastFertDays : Number(document.getElementById('ob-last-fert')?.value || 14);
      this.consultationData.lastFertType = hist ? hist.lastFertType : (document.getElementById('ob-fert-type')?.value || 'Liquid Foliar');
      this.consultationData.preEmergentStatus = hist ? hist.preEmergentStatus : (document.getElementById('ob-pre-emergent')?.value || 'none');
      this.consultationData.lastRenovation = hist ? hist.lastRenovation : (document.getElementById('ob-renovation')?.value || 'last_year');
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

    const zonesWithPhotos = d.zonePhotos
      ? d.zones.filter(z => (d.zonePhotos[z.id] || []).length > 0)
      : [];
    const totalPhotosCount = zonesWithPhotos.reduce((acc, z) => acc + d.zonePhotos[z.id].length, 0);

    let diagnosisHTML = `
      <div class="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
        <div class="font-bold flex items-center gap-1.5 text-emerald-900">
          <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600"></i>
          <span>Blade's Section Diagnosis:</span>
        </div>
        <p class="leading-relaxed">Configured <strong>${d.zones.length} distinct lawn section${d.zones.length === 1 ? '' : 's'}</strong> with custom names & attention levels.</p>
        <div class="pt-1.5 border-t border-emerald-200/80 text-[11px] text-emerald-800 space-y-1">
          ${d.zones.map(z => {
            const pCnt = (d.zonePhotos && d.zonePhotos[z.id]) ? d.zonePhotos[z.id].length : 0;
            return `<div>• <strong>${z.name}</strong>: ${z.grassType} @ ${z.hoc}mm (${attentionNames[z.attentionLevel] || '🌿 Standard'})${pCnt > 0 ? ` — 📸 ${pCnt} photo${pCnt === 1 ? '' : 's'}` : ''}</div>`;
          }).join('')}
          ${totalPhotosCount > 0 ? `<div class="pt-1 text-[10px] font-bold text-emerald-900">• 📸 Queued ${totalPhotosCount} photo${totalPhotosCount === 1 ? '' : 's'} for instant AI inspection when you tap "Let's Grow!"</div>` : ''}
          <div class="pt-1 text-[10px] text-emerald-700">• Pre-Emergent: <strong>${d.preEmergentStatus === 'active' ? 'Active' : 'Missing / Urgent Application'}</strong></div>
        </div>
        <div class="pt-2 mt-1 border-t border-emerald-200/80 space-y-1.5">
          <span class="text-[10px] font-bold uppercase tracking-wider text-emerald-900 block">Action Planner Schedule Style:</span>
          <div class="grid grid-cols-2 gap-1.5">
            <button type="button" onclick="App.setPlannerMode('segmented'); App.renderConsultationSummary();" class="p-2 rounded-xl border text-left transition-all ${this.plannerMode !== 'aligned' ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs' : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-100/50'}">
              <span class="text-[11px] font-bold block">🗂️ Segmented by Zone</span>
              <span class="text-[9px] opacity-85 block">Separate tasks per yard area</span>
            </button>
            <button type="button" onclick="App.setPlannerMode('aligned'); App.renderConsultationSummary();" class="p-2 rounded-xl border text-left transition-all ${this.plannerMode === 'aligned' ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs' : 'bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-100/50'}">
              <span class="text-[11px] font-bold block">🔗 Align All Together</span>
              <span class="text-[9px] opacity-85 block">Combine shared yard treatments</span>
            </button>
          </div>
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

    // Save per-zone history logs so each section remembers its own last cut & feed
    if (d.zoneHistory && d.zones) {
      d.zones.forEach(z => {
        const zh = d.zoneHistory[z.id] || {
          lastMowDays: d.lastMowDays,
          lastFertDays: d.lastFertDays,
          lastFertType: d.lastFertType,
          preEmergentStatus: d.preEmergentStatus,
          lastRenovation: d.lastRenovation
        };
        const zMowDate = new Date();
        zMowDate.setDate(zMowDate.getDate() - (zh.lastMowDays || 3));
        const zFertDate = new Date();
        zFertDate.setDate(zFertDate.getDate() - (zh.lastFertDays || 14));

        StorageManager.saveZoneHistory(z.id, {
          lastMow: zMowDate.toISOString(),
          lastFeed: zFertDate.toISOString(),
          lastFeedProduct: zh.lastFertType || 'Liquid Foliar',
          preEmergentStatus: zh.preEmergentStatus || 'none',
          lastRenovation: zh.lastRenovation || 'last_year'
        });
      });
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

    const zonesWithPhotos = d.zonePhotos
      ? Object.keys(d.zonePhotos).filter(zId => Array.isArray(d.zonePhotos[zId]) && d.zonePhotos[zId].length > 0)
      : [];

    if (zonesWithPhotos.length > 0) {
      this.showOnboarding(false);
      this.analyzeOnboardingZonePhotos(d.zonePhotos, zonesWithPhotos);
    } else if (d.initialPhotos && d.initialPhotos.length > 0) {
      this.showOnboarding(false);
      const firstZone = StorageManager.getZones()[0];
      const zId = firstZone ? firstZone.id : 'front_main';
      this.scanTargetZoneId = zId;
      this.stagedPhotosByZone[zId] = [...d.initialPhotos];
      this.triggerMultiPhotoAnalysis();
    } else {
      this.showOnboarding(false);
      this.handleProfileChange();
      this.switchTab('dashboard');
      this.showToast("🌱 High-five! Blade has initialized your 6-horizon roadmap.");
    }
  },

  async analyzeOnboardingZonePhotos(zonePhotos, zoneIds) {
    const zones = StorageManager.getZones();
    const settings = StorageManager.getSettings();
    let firstResult = null;
    let firstZone = null;

    this.showToast(`🔍 Blade is inspecting ${zoneIds.length} lawn section${zoneIds.length === 1 ? '' : 's'}...`);

    for (const zId of zoneIds) {
      const photos = zonePhotos[zId];
      const targetZone = zones.find(z => z.id === zId) || zones[0];
      try {
        const result = await VisionEngine.analyzeMultipleImages(photos, this.profile, targetZone, settings.apiKey);
        const enriched = {
          ...result,
          zoneId: targetZone ? targetZone.id : zId,
          isPhotoScan: true
        };
        if (targetZone) {
          this.latestZoneScanResults[targetZone.id] = enriched;
          StorageManager.addScanRecord(enriched, targetZone.id);
        }
        if (!firstResult) {
          firstResult = enriched;
          firstZone = targetZone;
        }
      } catch (e) {
        console.warn('Onboarding photo analysis skipped for zone', zId, e);
      }
    }

    if (firstResult) {
      this.currentPlan = {
        date: new Date().toISOString(),
        ...firstResult
      };
      if (firstZone) {
        this.activeZoneId = firstZone.id;
        StorageManager.setActiveZoneId(firstZone.id);
      }
      StorageManager.saveActivePlan(this.currentPlan);
      this.renderAll();
      this.showScanResultModal(firstResult, firstZone);
      NotificationManager.playTone();
    } else {
      this.handleProfileChange();
      this.switchTab('dashboard');
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
    ], this.profile.equipment || [], 'equipment');

    this.renderChecklistGroup('fertilisers-checklist', [
      'Slow Release Granular (20-2-10)',
      'Liquid Foliar Nitrogen & Iron',
      'Seaweed & Humic Acid Biostimulant'
    ], this.profile.fertilisers || [], 'fertilisers');

    this.renderChecklistGroup('herbicides-checklist', [
      'Prodiamine / Barricade (Pre-emergent)',
      'Bow & Arrow / Dicamba (Selective Broadleaf)',
      'Primo Maxx / Plant Growth Regulator (PGR)',
      'Soil Wetting Agent (Surfactant)'
    ], [...(this.profile.herbicides || []), ...(this.profile.specialTreatments || [])], 'herbicides');
  },

  renderChecklistGroup(containerId, defaultOptions, activeList = [], categoryKey = '') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const customCat = (this.profile.customCatalog && Array.isArray(this.profile.customCatalog[categoryKey]))
      ? this.profile.customCatalog[categoryKey]
      : [];
    const mergedOptions = [...defaultOptions];
    [...customCat, ...activeList].forEach(item => {
      if (item && !mergedOptions.includes(item)) {
        mergedOptions.push(item);
      }
    });

    container.innerHTML = mergedOptions.map((opt, i) => {
      const checked = activeList.includes(opt);
      const isCustom = !defaultOptions.includes(opt);
      const inputId = `${containerId}_${i}`;
      const escapedOpt = opt.replace(/'/g, "\\'");
      return `
        <div class="flex items-center justify-between gap-2 p-2.5 rounded-xl border transition-colors ${checked ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium' : 'bg-white border-slate-200 text-slate-600'}">
          <label for="${inputId}" class="flex items-center gap-2.5 flex-1 cursor-pointer select-none text-xs">
            <input type="checkbox" id="${inputId}" value="${opt.replace(/"/g, '&quot;')}" ${checked ? 'checked' : ''} class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500" onchange="App.handleProfileChecklistChange('${containerId}')" />
            <span>${opt}</span>
          </label>
          ${isCustom ? `<button type="button" onclick="App.removeCustomProfileItem('${categoryKey}', '${escapedOpt}')" class="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-slate-400 hover:text-rose-600 hover:bg-rose-50" title="Remove item">✕</button>` : ''}
        </div>
      `;
    }).join('');
  },

  addCustomProfileItem(categoryKey) {
    const inputMap = {
      equipment: 'custom-equipment-input',
      fertilisers: 'custom-fertilisers-input',
      herbicides: 'custom-herbicides-input'
    };
    const inputEl = document.getElementById(inputMap[categoryKey]);
    const val = inputEl ? inputEl.value.trim() : '';
    if (!val) {
      this.showToast('Please enter a name to add.');
      return;
    }
    if (inputEl) inputEl.value = '';

    if (!this.profile.customCatalog) this.profile.customCatalog = {};
    if (!Array.isArray(this.profile.customCatalog[categoryKey])) {
      this.profile.customCatalog[categoryKey] = [];
    }
    if (!this.profile.customCatalog[categoryKey].includes(val)) {
      this.profile.customCatalog[categoryKey].push(val);
    }

    if (categoryKey === 'equipment') {
      if (!Array.isArray(this.profile.equipment)) this.profile.equipment = [];
      if (!this.profile.equipment.includes(val)) this.profile.equipment.push(val);
    } else if (categoryKey === 'fertilisers') {
      if (!Array.isArray(this.profile.fertilisers)) this.profile.fertilisers = [];
      if (!this.profile.fertilisers.includes(val)) this.profile.fertilisers.push(val);
    } else if (categoryKey === 'herbicides') {
      if (!Array.isArray(this.profile.herbicides)) this.profile.herbicides = [];
      if (!this.profile.herbicides.includes(val)) this.profile.herbicides.push(val);
    }

    StorageManager.saveProfile(this.profile);
    this.renderProfileForm();
    this.handleProfileChange();
    this.showToast(`✅ Added "${val}" to your profile!`);
  },

  removeCustomProfileItem(categoryKey, itemName) {
    if (this.profile.customCatalog && Array.isArray(this.profile.customCatalog[categoryKey])) {
      this.profile.customCatalog[categoryKey] = this.profile.customCatalog[categoryKey].filter(x => x !== itemName);
    }
    if (categoryKey === 'equipment' && Array.isArray(this.profile.equipment)) {
      this.profile.equipment = this.profile.equipment.filter(x => x !== itemName);
    } else if (categoryKey === 'fertilisers' && Array.isArray(this.profile.fertilisers)) {
      this.profile.fertilisers = this.profile.fertilisers.filter(x => x !== itemName);
    } else if (categoryKey === 'herbicides') {
      if (Array.isArray(this.profile.herbicides)) {
        this.profile.herbicides = this.profile.herbicides.filter(x => x !== itemName);
      }
      if (Array.isArray(this.profile.specialTreatments)) {
        this.profile.specialTreatments = this.profile.specialTreatments.filter(x => x !== itemName);
      }
    }
    StorageManager.saveProfile(this.profile);
    this.renderProfileForm();
    this.handleProfileChange();
    this.showToast(`Removed "${itemName}".`);
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
      customCatalog: this.profile.customCatalog || {},
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
    const granted = NotificationManager.hasPermission();
    const statusBadge = document.getElementById('notification-permission-badge');
    if (statusBadge) {
      statusBadge.innerText = granted ? 'Active & Enabled' : 'Tap Enable Below';
      statusBadge.className = `px-2.5 py-1 rounded-full text-xs font-semibold ${granted ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`;
    }
    const calBtnLabel = document.getElementById('cal-push-btn-label');
    if (calBtnLabel) {
      calBtnLabel.innerText = granted ? 'Alerts ON' : 'Push Alerts';
    }
  },

  async enableCalendarPushReminders() {
    const granted = await NotificationManager.requestPermission();
    this.renderNotificationStatus();
    if (granted) {
      const settings = StorageManager.getSettings();
      settings.remindersEnabled = true;
      StorageManager.saveSettings(settings);
      const calData = this.getCalendarSchedule(14);
      const completedTasks = StorageManager.getCompletedTasks();
      NotificationManager.sendCalendarTestNotification(calData.days, completedTasks);
      this.showToast('🔔 Push Notification reminders enabled for your Calendar!');
    } else {
      this.showToast('Allow notifications in your phone/browser settings to receive alerts.');
    }
  },

  sendTestCalendarNotification() {
    if (!NotificationManager.hasPermission()) {
      this.enableCalendarPushReminders();
      return;
    }
    const calData = this.getCalendarSchedule(14);
    const completedTasks = StorageManager.getCompletedTasks();
    NotificationManager.sendCalendarTestNotification(calData.days, completedTasks);
    this.showToast('📲 Sent calendar push notification to your device!');
  },

  /* ------------------- USER-ADDED CUSTOM CALENDAR ENTRIES ------------------- */

  openAddCalendarEventModal() {
    const modal = document.getElementById('add-calendar-event-modal');
    if (!modal) return;
    const dateInput = document.getElementById('custom-cal-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    const zoneSelect = document.getElementById('custom-cal-zone');
    if (zoneSelect) {
      const zones = StorageManager.getZones();
      const currentZoneId = this.activeZoneId || 'all';
      zoneSelect.innerHTML = `
        <option value="all" ${currentZoneId === 'all' ? 'selected' : ''}>🌿 All Lawn Sections</option>
        ${zones.map(z => `<option value="${z.id}" ${currentZoneId === z.id ? 'selected' : ''}>📍 ${z.name}</option>`).join('')}
      `;
    }
    modal.classList.remove('hidden');
  },

  closeAddCalendarEventModal() {
    const modal = document.getElementById('add-calendar-event-modal');
    if (modal) modal.classList.add('hidden');
  },

  async saveUserCalendarEntry() {
    const titleEl = document.getElementById('custom-cal-title');
    const catEl = document.getElementById('custom-cal-category');
    const zoneEl = document.getElementById('custom-cal-zone');
    const dateEl = document.getElementById('custom-cal-date');
    const timeEl = document.getElementById('custom-cal-time');
    const repeatEl = document.getElementById('custom-cal-repeat');
    const notesEl = document.getElementById('custom-cal-notes');
    const remindEl = document.getElementById('custom-cal-remind');

    const title = titleEl ? titleEl.value.trim() : '';
    if (!title) {
      this.showToast('Please enter a title for your calendar entry.');
      return;
    }

    const cat = catEl ? catEl.value : 'custom';
    const catMeta = {
      mow: { icon: '✂️', color: 'emerald' },
      water: { icon: '💧', color: 'sky' },
      feed: { icon: '🌱', color: 'teal' },
      weed: { icon: '🎯', color: 'amber' },
      custom: { icon: '🛠️', color: 'indigo' }
    }[cat] || { icon: '🛠️', color: 'emerald' };

    const timeVal = (timeEl && timeEl.value) ? timeEl.value : '08:00';
    const [hhStr, mmStr] = timeVal.split(':');
    const startH = parseInt(hhStr || '8', 10);
    const startM = parseInt(mmStr || '0', 10);
    const period = startH >= 12 ? 'pm' : 'am';
    const h12 = startH % 12 === 0 ? 12 : startH % 12;
    const timeLabel = `${h12}:${String(startM).padStart(2, '0')} ${period}`;

    const zones = StorageManager.getZones();
    const zoneId = zoneEl ? zoneEl.value : 'all';
    const zoneName = zoneId === 'all' ? 'All Sections' : (zones.find(z => z.id === zoneId)?.name || 'Lawn');
    const notes = notesEl ? notesEl.value.trim() : '';
    const repeat = repeatEl ? repeatEl.value : 'once';
    const repeatLabel = repeat === 'weekly' ? 'Weekly' : repeat === 'fortnightly' ? 'Fortnightly' : repeat === 'monthly' ? 'Monthly' : '';

    const subParts = [zoneName];
    if (repeatLabel) subParts.push(repeatLabel);
    if (notes) subParts.push(notes);

    const saved = StorageManager.addUserCalendarEvent({
      title,
      type: cat,
      icon: catMeta.icon,
      color: catMeta.color,
      zoneId,
      dateKey: (dateEl && dateEl.value) ? dateEl.value : new Date().toISOString().split('T')[0],
      timeStr: timeVal,
      startHour: startH,
      timeLabel,
      repeat,
      subtext: subParts.join(' • '),
      remindPush: remindEl ? remindEl.checked : true
    });

    if (titleEl) titleEl.value = '';
    if (notesEl) notesEl.value = '';
    this.closeAddCalendarEventModal();

    if (remindEl && remindEl.checked && !NotificationManager.hasPermission()) {
      await NotificationManager.requestPermission();
      this.renderNotificationStatus();
    }

    this.renderDashboard();
    this.renderTasksList();
    this.showToast(`📅 Added "${saved.title}" to your Calendar!`);
  },

  deleteUserCalendarEntry(entryId) {
    StorageManager.deleteUserCalendarEvent(entryId);
    this.renderDashboard();
    this.renderTasksList();
    this.showToast('🗑️ Removed custom entry from Calendar.');
  },

  renderHistory() {
    const container = document.getElementById('history-scans-list');
    if (!container) return;
    const history = StorageManager.getScanHistory();

    if (history.length === 0) {
      container.innerHTML = `
        <div class="text-center py-2 text-slate-400 text-[11px]">
          No previous photo check-ins yet. Snap or upload your first photo above!
        </div>
      `;
      return;
    }

    const zones = StorageManager.getZones();
    container.innerHTML = history.slice(0, 3).map(scan => {
      const zName = scan.zoneName || zones.find(z => z.id === scan.zoneId)?.name || 'Lawn Section';
      const targetZId = scan.zoneId && scan.zoneId !== 'all' ? scan.zoneId : (zones[0]?.id || 'all');
      return `
        <div onclick="App.openSectionAnalysisModal('${targetZId}')" class="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-emerald-50/50 rounded-xl border border-slate-200 hover:border-emerald-300 text-xs cursor-pointer transition-all">
          <div class="flex-1 pr-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-bold text-slate-800">${zName}</span>
              <span class="text-[10px] text-slate-400">• ${scan.formattedDate}</span>
            </div>
            <p class="text-[10px] text-slate-500 leading-snug mt-0.5">${scan.overallVerdict}</p>
          </div>
          <div class="flex items-center gap-1.5 flex-shrink-0">
            <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
              ${scan.healthScore}%
            </span>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-400"></i>
          </div>
        </div>
      `;
    }).join('');
  },

  renderWeatherZones() {
    const container = document.getElementById('weather-zones-list');
    const holmanSummaryEl = document.getElementById('weather-holman-summary');
    const tapTimer = StorageManager.getTapTimer();
    const outlets = (tapTimer && Array.isArray(tapTimer.outlets)) ? tapTimer.outlets : [];
    const activeOutlet = outlets.find(o => o.enabled) || outlets[0];

    if (holmanSummaryEl && activeOutlet) {
      const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
      const order = [1, 2, 3, 4, 5, 6, 0];
      const daysTxt = activeOutlet.mode === 'odd'
        ? 'Odd Days'
        : activeOutlet.mode === 'even'
          ? 'Even Days'
          : activeOutlet.mode === 'interval'
            ? `Every ${activeOutlet.intervalDays || 3}d`
            : order.filter(d => (activeOutlet.days || []).includes(d)).map(d => dayMap[d]).join(', ') || 'Off';
      const sh = String(activeOutlet.startHour ?? 5).padStart(2, '0');
      const sm = String(activeOutlet.startMin ?? 0).padStart(2, '0');
      holmanSummaryEl.innerText = `Zone ${activeOutlet.outlet}: ${daysTxt} • ${sh}:${sm} (${activeOutlet.runMinutes || 20} min) synced to Calendar`;
    }

    if (!container) return;
    const zones = StorageManager.getZones();
    const skipRain = this.weather?.shouldSkipSprinklers;

    container.innerHTML = zones.map(z => {
      const isShaded = (z.sunExposure || '').toLowerCase().includes('shade');
      const isRecovery = z.attentionLevel === 'recovery';
      const isSelected = this.activeZoneId === z.id;
      const zoneLogs = StorageManager.getZoneLogs(z.id);

      let waterAdvice = 'Standard 12mm dawn soak';
      if (skipRain) {
        waterAdvice = '🌧️ Skip sprinklers (rain forecast)';
      } else if (isRecovery) {
        waterAdvice = '🩹 Wetting agent + 15mm soak';
      } else if (isShaded) {
        waterAdvice = '⛅ Reduce runtime by 25% (shade)';
      }

      return `
        <div onclick="App.switchZone('${z.id}')" class="p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 text-xs ${isSelected ? 'bg-sky-50 border-sky-300' : 'bg-slate-50 border-slate-200 hover:border-sky-200'}">
          <div class="flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <strong class="text-slate-900">${z.name}</strong>
              <span class="text-[10px] text-slate-400">• Last: ${this.formatRelativeTime(zoneLogs.lastWater)}</span>
            </div>
            <p class="text-[11px] text-sky-800 font-medium leading-snug mt-0.5">${waterAdvice}</p>
          </div>
          <button type="button" onclick="event.stopPropagation(); StorageManager.logWater('${z.id}'); App.renderDashboard(); App.renderWeatherZones(); App.showToast('💧 Logged watering for ${z.name.replace(/'/g, "\\'")}!');" class="px-2.5 py-1.5 rounded-lg bg-white hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold text-[10px] flex-shrink-0">
            + Log
          </button>
        </div>
      `;
    }).join('');
  },

  /* ------------------- HOLMAN BX4 TAP TIMER SYNC (CO3314) ------------------- */

  openHolmanTimerModal() {
    this.editingTapTimer = JSON.parse(JSON.stringify(StorageManager.getTapTimer()));
    const modal = document.getElementById('holman-timer-modal');
    if (!modal) return;
    this.renderHolmanModal();
    modal.classList.remove('hidden');
    if (window.lucide) {
      setTimeout(() => lucide.createIcons(), 10);
    }
  },

  closeHolmanTimerModal() {
    const modal = document.getElementById('holman-timer-modal');
    if (modal) modal.classList.add('hidden');
  },

  getActiveHolmanOutletObj() {
    if (!this.editingTapTimer) {
      this.editingTapTimer = StorageManager.getTapTimer();
    }
    const activeNum = this.editingTapTimer.activeOutlet || 1;
    return this.editingTapTimer.outlets.find(o => o.outlet === activeNum) || this.editingTapTimer.outlets[0];
  },

  selectHolmanOutlet(outletNum) {
    if (!this.editingTapTimer) return;
    this.editingTapTimer.activeOutlet = outletNum;
    this.renderHolmanModal();
  },

  toggleHolmanOutletEnabled(checked) {
    const outlet = this.getActiveHolmanOutletObj();
    if (!outlet) return;
    outlet.enabled = !!checked;
    this.renderHolmanModal();
  },

  updateHolmanOutletField(field, value) {
    const outlet = this.getActiveHolmanOutletObj();
    if (!outlet) return;
    outlet[field] = value;
    this.renderHolmanModal();
  },

  toggleHolmanDay(dayIndex) {
    const outlet = this.getActiveHolmanOutletObj();
    if (!outlet) return;
    if (!Array.isArray(outlet.days)) outlet.days = [];
    const idx = outlet.days.indexOf(dayIndex);
    if (idx >= 0) {
      outlet.days.splice(idx, 1);
    } else {
      outlet.days.push(dayIndex);
    }
    this.renderHolmanModal();
  },

  renderHolmanModal() {
    const outlet = this.getActiveHolmanOutletObj();
    if (!outlet) return;

    // 1. Outlet 1-4 buttons
    const outletTabsEl = document.getElementById('holman-outlet-tabs');
    if (outletTabsEl) {
      outletTabsEl.innerHTML = this.editingTapTimer.outlets.map(o => {
        const isCurrent = o.outlet === outlet.outlet;
        return `
          <button type="button" onclick="App.selectHolmanOutlet(${o.outlet})" class="py-2.5 rounded-2xl font-extrabold text-base transition-all border ${isCurrent ? 'bg-blue-600 text-white border-blue-700 shadow-sm' : 'bg-slate-100 text-slate-800 border-slate-200 hover:bg-slate-200'}">
            ${o.outlet}
          </button>
        `;
      }).join('');
    }

    // Enabled checkbox
    const enabledCheck = document.getElementById('holman-outlet-enabled');
    if (enabledCheck) enabledCheck.checked = !!outlet.enabled;

    // 2. Lawn Section Link dropdown
    const zoneSelect = document.getElementById('holman-linked-zone');
    if (zoneSelect) {
      const zones = StorageManager.getZones();
      zoneSelect.innerHTML = `
        <option value="all" ${outlet.linkedZoneId === 'all' ? 'selected' : ''}>🌿 All Lawn Sections (Entire Property)</option>
        ${zones.map(z => `<option value="${z.id}" ${outlet.linkedZoneId === z.id ? 'selected' : ''}>📍 ${z.name}</option>`).join('')}
      `;
    }

    // 3. Mode Tabs (7 DAYS | INTERVAL | ODD DAYS | EVEN DAYS)
    const modeTabsEl = document.getElementById('holman-mode-tabs');
    const modes = [
      { id: '7days', label: '7 DAYS' },
      { id: 'interval', label: 'INTERVAL' },
      { id: 'odd', label: 'ODD DAYS' },
      { id: 'even', label: 'EVEN DAYS' }
    ];
    if (modeTabsEl) {
      modeTabsEl.innerHTML = modes.map(m => {
        const active = (outlet.mode || '7days') === m.id;
        return `
          <button type="button" onclick="App.updateHolmanOutletField('mode', '${m.id}')" class="py-2 px-1 rounded-xl text-[10px] font-extrabold transition-all ${active ? 'bg-blue-600 text-white shadow-2xs' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}">
            ${m.label}
          </button>
        `;
      }).join('');
    }

    // 4. M T W T F S S Vertical Blue Slider Toggles (Matches Holman iGardener UI)
    const daysBox = document.getElementById('holman-days-box');
    const intervalBox = document.getElementById('holman-interval-box');
    if (daysBox && intervalBox) {
      if ((outlet.mode || '7days') === 'interval') {
        daysBox.classList.add('hidden');
        intervalBox.classList.remove('hidden');
        const intInput = document.getElementById('holman-interval-input');
        if (intInput) intInput.value = outlet.intervalDays || 3;
      } else {
        daysBox.classList.remove('hidden');
        intervalBox.classList.add('hidden');
      }
    }

    const slidersEl = document.getElementById('holman-day-sliders');
    if (slidersEl) {
      const holmanWeek = [
        { dayIndex: 1, letter: 'M' },
        { dayIndex: 2, letter: 'T' },
        { dayIndex: 3, letter: 'W' },
        { dayIndex: 4, letter: 'T' },
        { dayIndex: 5, letter: 'F' },
        { dayIndex: 6, letter: 'S' },
        { dayIndex: 0, letter: 'S' }
      ];
      slidersEl.innerHTML = holmanWeek.map(d => {
        const isOn = Array.isArray(outlet.days) && outlet.days.includes(d.dayIndex);
        return `
          <div onclick="App.toggleHolmanDay(${d.dayIndex})" class="flex flex-col items-center gap-1.5 cursor-pointer select-none">
            <span class="text-xs font-extrabold text-slate-900">${d.letter}</span>
            <div class="w-7 h-14 rounded-full p-1 flex flex-col ${isOn ? 'bg-blue-600 justify-start' : 'bg-slate-300 justify-end'} transition-all shadow-inner">
              <div class="w-5 h-5 rounded-full bg-white shadow-xs"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // 5. Start Time & Run Time
    const shEl = document.getElementById('holman-start-hour');
    const smEl = document.getElementById('holman-start-min');
    const runEl = document.getElementById('holman-run-mins');
    if (shEl) shEl.value = outlet.startHour ?? 5;
    if (smEl) smEl.value = outlet.startMin ?? 0;
    if (runEl) runEl.value = outlet.runMinutes ?? 20;
  },

  importHolmanScreenshot(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = 350;
          const h = Math.round((img.height / img.width) * w) || 750;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          // Sample the 7 vertical slider columns (M T W T F S S) across y = 39%..47% of the Holman iGardener screenshot
          const xFractions = [0.09, 0.226, 0.362, 0.50, 0.636, 0.772, 0.908];
          const dayIndices = [1, 2, 3, 4, 5, 6, 0];
          const detectedDays = [];

          xFractions.forEach((xf, colIdx) => {
            const cx = Math.floor(w * xf);
            let bluePixels = 0;
            for (let y = Math.floor(h * 0.39); y <= Math.floor(h * 0.47); y += 2) {
              for (let dx = -4; dx <= 4; dx += 2) {
                const px = ctx.getImageData(Math.max(0, Math.min(w - 1, cx + dx)), y, 1, 1).data;
                const r = px[0], g = px[1], b = px[2];
                // Holman active slider blue: strong blue channel compared to red
                if (b > 135 && (b - r) > 45 && g > 70) {
                  bluePixels++;
                }
              }
            }
            if (bluePixels >= 6) {
              detectedDays.push(dayIndices[colIdx]);
            }
          });

          const outlet = this.getActiveHolmanOutletObj();
          if (outlet && detectedDays.length > 0) {
            outlet.mode = '7days';
            outlet.days = detectedDays;
            outlet.enabled = true;
            this.renderHolmanModal();
            const dayNames = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
            const names = detectedDays.map(d => dayNames[d]).join(', ');
            this.showToast(`📸 Imported Holman schedule: ${names}!`);
          } else {
            this.showToast('📸 Screenshot loaded! Tap any day slider below to fine-tune.');
          }
        } catch (err) {
          console.warn('Screenshot scan fallback:', err);
          this.showToast('📸 Tap any day slider to match your Holman timer.');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  saveHolmanTimerAndClose() {
    if (this.editingTapTimer) {
      StorageManager.saveTapTimer(this.editingTapTimer);
    }
    this.closeHolmanTimerModal();
    this.renderDashboard();
    this.renderTasksList();
    this.renderWeatherZones();
    this.showToast('💧 Holman BX4 Tap Timer days synced to your Calendar!');
  },

  renderAnalytics() {
    const zones = StorageManager.getZones();
    const activeZone = this.activeZoneId !== 'all' ? zones.find(z => z.id === this.activeZoneId) : null;

    const selectorEl = document.getElementById('analytics-zone-selector');
    const activeLabelEl = document.getElementById('analytics-active-zone-label');
    const breakdownEl = document.getElementById('analytics-zones-breakdown');

    if (activeLabelEl) {
      activeLabelEl.innerText = activeZone ? activeZone.name : `All ${zones.length} Yard Zones`;
    }

    if (selectorEl) {
      selectorEl.innerHTML = `
        <button type="button" onclick="App.switchZone('all')" class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${this.activeZoneId === 'all' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
          <span>🌿 All Sections</span>
        </button>
        ${zones.map(z => `
          <button type="button" onclick="App.switchZone('${z.id}')" class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${this.activeZoneId === z.id ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            <span>📍 ${z.name}</span>
          </button>
        `).join('')}
      `;
    }

    const totalZonesArea = zones.reduce((s, z) => s + (Number(z.area) || 50), 0);
    const area = activeZone ? (Number(activeZone.area) || 50) : (totalZonesArea || this.profile.lawnArea || 250);
    const tier = this.profile.tier;
    const targetNPerM2 = activeZone
      ? (activeZone.attentionLevel === 'showpiece' ? 20 : activeZone.attentionLevel === 'recovery' ? 16 : 12)
      : (tier === 'full_pro' ? 18 : tier === 'semi_pro' ? 12 : 7);
    const totalAnnualN = ((targetNPerM2 * area) / 1000).toFixed(2);

    const nBudgetEl = document.getElementById('metric-n-budget');
    if (nBudgetEl) nBudgetEl.innerText = `${totalAnnualN} kg N / Yr (${area}m²)`;

    const mowingFreqEl = document.getElementById('metric-mow-freq');
    if (mowingFreqEl) {
      if (activeZone) {
        mowingFreqEl.innerText = activeZone.attentionLevel === 'showpiece'
          ? '2 - 3x / week'
          : activeZone.attentionLevel === 'low'
          ? 'Every 10 - 14d'
          : '1 - 2x / week';
      } else {
        mowingFreqEl.innerText = tier === 'full_pro' ? '2 - 3x per week' : tier === 'semi_pro' ? '1 - 2x per week' : 'Every 2 - 3 weeks';
      }
    }

    const hocVal = activeZone ? activeZone.hoc : this.profile.hoc;
    const hocEl = document.getElementById('metric-hoc');
    if (hocEl) {
      hocEl.innerText = `${hocVal} mm (${(hocVal / 25.4).toFixed(2)}")`;
    }

    if (breakdownEl) {
      breakdownEl.innerHTML = zones.map(z => {
        const zArea = Number(z.area) || 50;
        const zNRate = z.attentionLevel === 'showpiece' ? 20 : z.attentionLevel === 'recovery' ? 16 : 12;
        const zAnnualKg = ((zNRate * zArea) / 1000).toFixed(2);
        const zRes = this.getSectionAnalysisResult(z.id);
        const isCurrent = this.activeZoneId === z.id;
        return `
          <div onclick="App.switchZone('${z.id}')" class="p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 text-xs ${isCurrent ? 'bg-emerald-50 border-emerald-300 shadow-2xs' : 'bg-slate-50 border-slate-200 hover:border-emerald-200'}">
            <div class="space-y-0.5 min-w-0">
              <div class="flex items-center gap-1.5 flex-wrap">
                <strong class="text-slate-900">📍 ${z.name}</strong>
                <span class="text-[10px] font-bold px-2 py-0.2 rounded-full bg-white border border-slate-200 text-slate-700">${z.grassType}</span>
              </div>
              <div class="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                <span>Cut: <strong>${z.hoc}mm</strong></span>
                <span>•</span>
                <span>Area: <strong>${zArea}m²</strong></span>
                <span>•</span>
                <span>N Budget: <strong>${zAnnualKg}kg/yr</strong></span>
              </div>
            </div>
            <span class="px-2 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-extrabold text-[11px] flex-shrink-0">
              ${zRes ? zRes.healthScore : 85}%
            </span>
          </div>
        `;
      }).join('');
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
