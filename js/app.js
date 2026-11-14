/**
 * Main Application Controller for GreenMaster AI
 */
const App = {
  activeTab: 'planner',
  activeHorizon: 'oneWeek',
  currentPlan: null,
  profile: null,
  isScanning: false,

  init() {
    this.profile = StorageManager.getProfile();
    this.currentPlan = StorageManager.getActivePlan();

    // If no plan exists yet, generate initial baseline plan
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
        profile: this.profile
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
  },

  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Horizon Tabs (1W, 2W, 1M, 1Q, 6M, 1Y)
    document.querySelectorAll('[data-horizon]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const horizon = e.currentTarget.getAttribute('data-horizon');
        this.switchHorizon(horizon);
      });
    });

    // Photo input
    const photoInput = document.getElementById('lawn-photo-input');
    if (photoInput) {
      photoInput.addEventListener('change', (e) => this.handlePhotoSelected(e));
    }

    // Drag and drop photo
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

    // Demo Turfs
    document.querySelectorAll('[data-demo-turf]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = e.currentTarget.getAttribute('data-demo-turf');
        this.loadDemoTurf(type);
      });
    });

    // Profile Form
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
      profileForm.addEventListener('change', () => this.handleProfileChange());
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleProfileChange();
        this.showToast('Lawn Profile Updated! Action Plan Recalibrated.');
      });
    }

    // Calendar Export
    const calBtn = document.getElementById('export-calendar-btn');
    if (calBtn) {
      calBtn.addEventListener('click', () => {
        NotificationManager.exportPlanToCalendar(this.currentPlan);
        this.showToast('iCalendar (.ics) downloaded! Sync with Apple/Google Calendar.');
      });
    }

    // Push notification toggle
    const notifBtn = document.getElementById('enable-notifications-btn');
    if (notifBtn) {
      notifBtn.addEventListener('click', async () => {
        const granted = await NotificationManager.requestPermission();
        if (granted) {
          NotificationManager.showNotification('GreenMaster AI Active', 'Push reminders configured for your lawn maintenance cycles.');
          this.showToast('Push Notifications Enabled!');
          this.renderNotificationStatus();
        } else {
          this.showToast('Notification permission was denied.');
        }
      });
    }

    // Test notification button
    const testNotifBtn = document.getElementById('test-notification-btn');
    if (testNotifBtn) {
      testNotifBtn.addEventListener('click', () => {
        NotificationManager.showNotification('🌱 Lawn Checkup Reminder', 'Time for your weekly photo scan & cylinder reel mow!');
        NotificationManager.playTone();
        this.showToast('Notification sent & chime played!');
      });
    }
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
      btn.classList.toggle('text-emerald-600', active);
      btn.classList.toggle('text-slate-400', !active);
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
      tierBadge.className = `px-2.5 py-0.5 rounded-full text-xs font-semibold ${info.cls}`;
    }
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
          <p class="text-sm">No tasks pending for this timeframe.</p>
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
                <p class="text-xs text-slate-500 mt-1.5 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <span class="font-medium text-emerald-700">Agronomist Tip:</span> ${task.tip}
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

    // Update progress bar
    const progressEl = document.getElementById('horizon-progress-bar');
    const progressText = document.getElementById('horizon-progress-text');
    const percent = Math.round((completedCount / tasks.length) * 100);
    if (progressEl) progressEl.style.width = `${percent}%`;
    if (progressText) progressText.innerText = `${completedCount} of ${tasks.length} Completed (${percent}%)`;
  },

  handleTaskToggle(taskId) {
    const isDone = StorageManager.toggleTaskCompleted(taskId);
    if (isDone) {
      NotificationManager.playTone();
    }
    this.renderTasksList();
  },

  handlePhotoSelected(e) {
    if (e.target.files && e.target.files[0]) {
      this.processImageFile(e.target.files[0]);
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

      // Save as new active plan
      this.currentPlan = {
        date: new Date().toISOString(),
        ...result
      };
      StorageManager.saveActivePlan(this.currentPlan);

      // Save slim scan history (NO raw image blobs are stored, saving user data/privacy!)
      StorageManager.addScanRecord(result);

      // Finish scanning
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
      statusText.innerText = scanning ? 'AI Agronomist analyzing chlorophyll, density & weed patterns...' : 'Ready for photo';
    }
    if (scanBtn) {
      scanBtn.innerText = scanning ? 'Analyzing...' : 'Scan New Photo';
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
    // Switch to planner view to see the freshly generated plan
    this.switchTab('planner');
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

    // Checklist toggles
    this.renderChecklistGroup('equipment-checklist', [
      'Cylinder / Reel Mower',
      'Rotary Mower with Roller',
      'Dethatcher / Scarifier',
      'Coring Aerator',
      'Battery Backpack Sprayer',
      'Calibrated Rotary Spreader',
      'Lawn Levelawn / Sand Drag'
    ], this.profile.equipment);

    this.renderChecklistGroup('fertilisers-checklist', [
      'Slow Release Granular (20-2-10)',
      'Liquid Foliar Nitrogen & Iron',
      'Potassium Silicate (Blade stiffener)',
      'Seaweed & Humic Acid Biostimulant'
    ], this.profile.fertilisers);

    this.renderChecklistGroup('herbicides-checklist', [
      'Prodiamine / Barricade (Pre-emergent)',
      'Bow & Arrow / Dicamba (Selective Broadleaf)',
      'Monument / Sulfonylurea (Nutgrass & Sedges)',
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
      specialTreatments: getCheckedValues('herbicides-checklist').filter(h => h.includes('PGR') || h.includes('Wetting Agent'))
    };

    this.profile = updatedProfile;
    StorageManager.saveProfile(this.profile);

    // Recompute the plan according to the new profile settings
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
      profile: this.profile
    });

    this.currentPlan.actionPlan = recomputedPlan;
    StorageManager.saveActivePlan(this.currentPlan);

    this.renderHeader();
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
    // Annual Nitrogen Budget calculation
    const area = this.profile.lawnArea || 250;
    const tier = this.profile.tier;
    // Pro lawns aim for 3-4 lbs N / 1000 sq ft or ~15-20g N / m2 per year
    // Semi pro: ~10-12g N / m2
    // Low: ~5-8g N / m2
    const targetNPerM2 = tier === 'full_pro' ? 18 : tier === 'semi_pro' ? 12 : 7;
    const totalAnnualN = Math.round((targetNPerM2 * area) / 1000); // in kg

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
      toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-slate-900/95 text-white text-xs font-medium rounded-full shadow-2xl transition-all duration-300 pointer-events-none opacity-0';
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
