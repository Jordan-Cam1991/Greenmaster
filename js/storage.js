/**
 * Storage Manager for GreenMaster AI
 * Manages profile, multi-zone segments (Front/Back/Side), plan states, onboarding, and maintenance logs.
 */
const StorageManager = {
  KEYS: {
    PROFILE: 'gm_lawn_profile',
    ZONES: 'gm_lawn_zones',
    ACTIVE_ZONE: 'gm_active_zone_id',
    PLAN: 'gm_active_plan',
    SCAN_HISTORY: 'gm_scan_history',
    COMPLETED_TASKS: 'gm_completed_tasks',
    SETTINGS: 'gm_user_settings',
    ONBOARDED: 'gm_user_onboarded',
    LOGS: 'gm_maintenance_logs'
  },

  getDefaultZones() {
    return [
      {
        id: 'front',
        name: 'Front Yard',
        grassType: 'Bermuda / Couch',
        hoc: 12,
        area: 120,
        sunExposure: 'Full Sun (6+ hrs)',
        shadeFactor: 'low',
        notes: 'High curb-appeal, cylinder cut'
      },
      {
        id: 'back',
        name: 'Back Yard',
        grassType: 'Buffalo / St Augustine',
        hoc: 35,
        area: 130,
        sunExposure: 'Partial Shade (3-5 hrs)',
        shadeFactor: 'medium',
        notes: 'Family play area, higher cut for shade tolerance'
      }
    ];
  },

  getDefaultProfile() {
    return {
      lawnName: 'My Turf Masterpiece',
      grassType: 'Bermuda / Couch',
      tier: 'full_pro',
      hoc: 12,
      hocUnit: 'mm',
      lawnArea: 250,
      areaUnit: 'm²',
      sprinklers: 'In-Ground MP Rotators',
      wateringFreq: '2 times/week',
      wateringAmount: '12mm / 0.5 inch per session',
      equipment: [
        'Cylinder / Reel Mower',
        'Rotary Mower with Roller',
        'Battery Backpack Sprayer',
        'Calibrated Rotary Spreader'
      ],
      fertilisers: [
        'Slow Release Granular (20-2-10)',
        'Liquid Foliar Nitrogen & Iron',
        'Seaweed & Humic Acid Biostimulant'
      ],
      herbicides: [
        'Prodiamine / Barricade (Pre-emergent)',
        'Bow & Arrow / Dicamba (Selective Broadleaf)'
      ],
      specialTreatments: [
        'Primo Maxx / Plant Growth Regulator (PGR)',
        'Soil Wetting Agent (Hydra-Flo / Tournament-grade)'
      ],
      customOwnedProducts: []
    };
  },

  getZones() {
    try {
      const data = localStorage.getItem(this.KEYS.ZONES);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Error reading zones', e);
    }
    return this.getDefaultZones();
  },

  saveZones(zones) {
    try {
      localStorage.setItem(this.KEYS.ZONES, JSON.stringify(zones));
    } catch (e) {
      console.error('Error saving zones', e);
    }
  },

  getActiveZoneId() {
    return localStorage.getItem(this.KEYS.ACTIVE_ZONE) || 'all';
  },

  setActiveZoneId(id) {
    localStorage.setItem(this.KEYS.ACTIVE_ZONE, id);
  },

  getActiveZone() {
    const id = this.getActiveZoneId();
    if (id === 'all') return null;
    const zones = this.getZones();
    return zones.find(z => z.id === id) || null;
  },

  addZone(zone) {
    const zones = this.getZones();
    const newZone = {
      id: 'zone_' + Date.now(),
      name: zone.name || 'Side Yard',
      grassType: zone.grassType || 'Bermuda / Couch',
      hoc: Number(zone.hoc) || 20,
      area: Number(zone.area) || 50,
      sunExposure: zone.sunExposure || 'Full Sun (6+ hrs)',
      shadeFactor: zone.shadeFactor || 'low',
      notes: zone.notes || ''
    };
    zones.push(newZone);
    this.saveZones(zones);
    return newZone;
  },

  isOnboarded() {
    return localStorage.getItem(this.KEYS.ONBOARDED) === 'true';
  },

  setOnboarded(status = true) {
    localStorage.setItem(this.KEYS.ONBOARDED, status ? 'true' : 'false');
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

  addCustomOwnedProduct(productName, category = 'Fertiliser') {
    const profile = this.getProfile();
    if (!profile.customOwnedProducts) profile.customOwnedProducts = [];
    if (!profile.customOwnedProducts.includes(productName)) {
      profile.customOwnedProducts.push(productName);
    }
    if (category === 'Fertiliser' && !profile.fertilisers.includes(productName)) {
      profile.fertilisers.push(productName);
    } else if (category === 'Herbicide' && !profile.herbicides.includes(productName)) {
      profile.herbicides.push(productName);
    } else if (category === 'Treatment' && !profile.specialTreatments.includes(productName)) {
      profile.specialTreatments.push(productName);
    }
    this.saveProfile(profile);
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

  addScanRecord(record, zoneId = 'all') {
    try {
      const history = this.getScanHistory();
      const slimRecord = {
        id: 'scan_' + Date.now(),
        zoneId: zoneId,
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

  getLogs() {
    try {
      const data = localStorage.getItem(this.KEYS.LOGS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Error reading logs', e);
    }
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    return {
      lastMow: twoDaysAgo.toISOString(),
      lastWater: fiveDaysAgo.toISOString(),
      lastFeed: tenDaysAgo.toISOString(),
      fertiliserLevel: '85%',
      preEmergentActiveDays: 38
    };
  },

  logMow() {
    const logs = this.getLogs();
    logs.lastMow = new Date().toISOString();
    localStorage.setItem(this.KEYS.LOGS, JSON.stringify(logs));
    return logs;
  },

  logWater() {
    const logs = this.getLogs();
    logs.lastWater = new Date().toISOString();
    localStorage.setItem(this.KEYS.LOGS, JSON.stringify(logs));
    return logs;
  },

  logFeed(product = 'Liquid Foliar N-P-K') {
    const logs = this.getLogs();
    logs.lastFeed = new Date().toISOString();
    logs.lastFeedProduct = product;
    localStorage.setItem(this.KEYS.LOGS, JSON.stringify(logs));
    return logs;
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
      rainAlertsEnabled: true,
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
