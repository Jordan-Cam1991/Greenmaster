/**
 * Storage Manager for GreenMaster AI
 * Manages profile, plan states, task completion, and privacy-respecting scan records.
 */
const StorageManager = {
  KEYS: {
    PROFILE: 'gm_lawn_profile',
    PLAN: 'gm_active_plan',
    SCAN_HISTORY: 'gm_scan_history',
    COMPLETED_TASKS: 'gm_completed_tasks',
    SETTINGS: 'gm_user_settings'
  },

  getDefaultProfile() {
    return {
      lawnName: 'My Pristine Turf',
      grassType: 'Bermuda / Couch',      // Bermuda/Couch, Buffalo/St Augustine, Kikuyu, Zoysia, Kentucky Bluegrass, Tall Fescue, Ryegrass
      tier: 'full_pro',                 // 'low_maintenance', 'semi_pro', 'full_pro'
      hoc: 12,                          // Height of Cut in mm (12mm for pro reel, 25mm for semi, 45mm for rotary)
      hocUnit: 'mm',
      lawnArea: 250,                    // square meters or sq ft
      areaUnit: 'm²',
      sprinklers: 'In-Ground MP Rotators', // In-Ground Popups, In-Ground MP Rotators, Smart Rachio/B-hyve, Oscillating Hose Sprinkler, Manual Hand Watering
      wateringFreq: '2 times/week',     // '1 time/week', '2 times/week', '3 times/week', 'Daily light cycle'
      wateringAmount: '12mm / 0.5 inch per session',
      equipment: [
        'Cylinder / Reel Mower',
        'Rotary Mower with Roller',
        'Dethatcher / Scarifier',
        'Coring Aerator',
        'Battery Backpack Sprayer',
        'Calibrated Rotary Spreader',
        'Lawn Levelawn / Sand Drag'
      ],
      fertilisers: [
        'Slow Release Granular (20-2-10)',
        'Liquid Foliar Nitrogen & Iron',
        'Potassium Silicate (Blade stiffener)',
        'Seaweed & Humic Acid Biostimulant'
      ],
      herbicides: [
        'Prodiamine / Barricade (Pre-emergent)',
        'Bow & Arrow / Dicamba (Selective Broadleaf)',
        'Monument / Sulfonylurea (Nutgrass & Sedges)'
      ],
      specialTreatments: [
        'Primo Maxx / Plant Growth Regulator (PGR)',
        'Soil Wetting Agent (Hydra-Flo / Tournament-grade)'
      ]
    };
  },

  getProfile() {
    try {
      const data = localStorage.getItem(this.KEYS.PROFILE);
      if (data) {
        return { ...this.getDefaultProfile(), ...JSON.parse(data) };
      }
    } catch (e) {
      console.warn('Error reading profile', e);
    }
    return this.getDefaultProfile();
  },

  saveProfile(profile) {
    try {
      localStorage.setItem(this.KEYS.PROFILE, JSON.stringify(profile));
    } catch (e) {
      console.error('Error saving profile', e);
    }
  },

  getActivePlan() {
    try {
      const data = localStorage.getItem(this.KEYS.PLAN);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Error reading plan', e);
    }
    return null;
  },

  saveActivePlan(plan) {
    try {
      localStorage.setItem(this.KEYS.PLAN, JSON.stringify(plan));
    } catch (e) {
      console.error('Error saving active plan', e);
    }
  },

  getScanHistory() {
    try {
      const data = localStorage.getItem(this.KEYS.SCAN_HISTORY);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Error reading history', e);
    }
    return [];
  },

  addScanRecord(record) {
    try {
      const history = this.getScanHistory();
      // Keep only key metrics & diagnoses - do NOT store raw full-size photo blobs to preserve storage
      const slimRecord = {
        id: 'scan_' + Date.now(),
        date: new Date().toISOString(),
        formattedDate: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        healthScore: record.healthScore || 85,
        darkGreenColorIndex: record.darkGreenColorIndex || 78,
        densityScore: record.densityScore || 82,
        weedPressure: record.weedPressure || 'Low',
        weedsDetected: record.weedsDetected || [],
        diseaseOrStress: record.diseaseOrStress || 'None detected',
        overallVerdict: record.overallVerdict || 'Healthy turf'
      };
      
      history.unshift(slimRecord);
      // Keep max 20 scans
      if (history.length > 20) history.pop();
      localStorage.setItem(this.KEYS.SCAN_HISTORY, JSON.stringify(history));
      return slimRecord;
    } catch (e) {
      console.error('Error adding scan record', e);
    }
  },

  getCompletedTasks() {
    try {
      const data = localStorage.getItem(this.KEYS.COMPLETED_TASKS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Error reading completed tasks', e);
    }
    return {};
  },

  toggleTaskCompleted(taskId) {
    try {
      const tasks = this.getCompletedTasks();
      if (tasks[taskId]) {
        delete tasks[taskId];
      } else {
        tasks[taskId] = new Date().toISOString();
      }
      localStorage.setItem(this.KEYS.COMPLETED_TASKS, JSON.stringify(tasks));
      return !!tasks[taskId];
    } catch (e) {
      console.error('Error toggling task', e);
      return false;
    }
  },

  getSettings() {
    try {
      const data = localStorage.getItem(this.KEYS.SETTINGS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Error reading settings', e);
    }
    return {
      apiKey: '',
      remindersEnabled: true,
      reminderTime: '08:00',
      reminderFrequency: 'Weekly on Saturday',
      hapticFeedback: true
    };
  },

  saveSettings(settings) {
    try {
      localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving settings', e);
    }
  }
};
