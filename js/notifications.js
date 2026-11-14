/**
 * Notification & Reminder Manager for GreenMaster AI
 * Supports Web Notifications, Service Worker Push, and .ICS Calendar Export
 */
const NotificationManager = {
  async requestPermission() {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return false;
    }
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  },

  hasPermission() {
    return 'Notification' in window && Notification.permission === 'granted';
  },

  showNotification(title, body, options = {}) {
    if (!this.hasPermission()) {
      console.log('Notification permission not granted');
      return;
    }

    this.playTone();

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23059669"/><path d="M50 20 L65 70 L35 70 Z" fill="%23fff"/></svg>',
          badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23059669"/></svg>',
          vibrate: [200, 100, 200],
          ...options
        });
      });
    } else {
      new Notification(title, {
        body,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="%23059669"/><path d="M50 20 L65 70 L35 70 Z" fill="%23fff"/></svg>',
        ...options
      });
    }
  },

  playTone() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      // Audio context might be restricted before interaction
    }
  },

  scheduleWeeklyReminders() {
    const settings = StorageManager.getSettings();
    if (!settings.remindersEnabled) return;

    const nextReminder = new Date();
    nextReminder.setDate(nextReminder.getDate() + 7);
    localStorage.setItem('gm_next_scan_reminder', nextReminder.toISOString());
  },

  /**
   * Checks today's scheduled calendar tasks and fires Push Notifications
   * for any uncompleted tasks that haven't been notified today.
   */
  checkAndFireCalendarReminders(calendarDays = [], completedTasks = {}) {
    if (!this.hasPermission()) return;
    const settings = typeof StorageManager !== 'undefined' ? StorageManager.getSettings() : { remindersEnabled: true };
    if (settings && settings.remindersEnabled === false) return;

    const todayBucket = Array.isArray(calendarDays) ? calendarDays[0] : null;
    if (!todayBucket || !Array.isArray(todayBucket.events) || todayBucket.events.length === 0) return;

    const notifiedRaw = localStorage.getItem('gm_notified_event_ids') || '{}';
    let notifiedMap = {};
    try {
      notifiedMap = JSON.parse(notifiedRaw);
    } catch (e) {
      notifiedMap = {};
    }

    const nowHour = new Date().getHours();
    let updated = false;

    todayBucket.events.forEach(ev => {
      if (completedTasks[ev.id] || notifiedMap[ev.id]) return;
      const targetHour = Number(ev.startHour ?? 8);
      // Fire push reminder if the task is due within the next hour or earlier today
      if (nowHour >= targetHour - 1) {
        this.showNotification(
          `${ev.icon || '🌱'} Lawn Reminder: ${ev.title}`,
          `${ev.timeLabel || 'Today'} — ${ev.subtext || 'Scheduled on your GreenMaster Calendar'}`
        );
        notifiedMap[ev.id] = new Date().toISOString();
        updated = true;
      }
    });

    if (updated) {
      localStorage.setItem('gm_notified_event_ids', JSON.stringify(notifiedMap));
    }
  },

  /**
   * Sends an immediate push notification summarizing the next scheduled calendar item
   */
  sendCalendarTestNotification(calendarDays = [], completedTasks = {}) {
    let nextEv = null;
    let nextDay = null;
    if (Array.isArray(calendarDays)) {
      for (const d of calendarDays) {
        for (const ev of (d.events || [])) {
          if (!completedTasks[ev.id]) {
            nextEv = ev;
            nextDay = d;
            break;
          }
        }
        if (nextEv) break;
      }
    }

    if (nextEv && nextDay) {
      const whenTxt = nextDay.isToday ? 'Today' : `${nextDay.dayName} ${nextDay.dayNumber} ${nextDay.monthShort}`;
      this.showNotification(
        `🔔 Up Next (${whenTxt}): ${nextEv.icon} ${nextEv.title}`,
        `${nextEv.timeLabel} • ${nextEv.subtext || 'Tap to view your GreenMaster Calendar'}`
      );
    } else {
      this.showNotification(
        '🔔 GreenMaster Calendar Reminders Active!',
        'We will send you push notifications when your scheduled lawn tasks are due.'
      );
    }
  },

  /**
   * Generates and downloads an iCalendar (.ics) file so users can sync
   * their auto-calculated Google Calendar lawn schedule into Apple Calendar / Google Calendar / Outlook
   */
  exportPlanToCalendar(plan, calendarDays = null) {
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//GreenMaster AI//Turf Care Planner//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:GreenMaster Lawn Care Schedule'
    ];

    if (Array.isArray(calendarDays) && calendarDays.length > 0) {
      calendarDays.forEach((day) => {
        (day.events || []).forEach((ev, idx) => {
          const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
          const yyyymmdd = day.dateKey.replace(/-/g, '');
          const startH = String(ev.startHour || 8).padStart(2, '0');
          const endH = String((ev.startHour || 8) + 1).padStart(2, '0');
          const dtstart = `${yyyymmdd}T${startH}0000`;
          const dtend = `${yyyymmdd}T${endH}0000`;
          const uid = `gm-cal-${day.dateKey}-${ev.type}-${idx}@greenmaster.ai`;

          icsContent.push('BEGIN:VEVENT');
          icsContent.push(`UID:${uid}`);
          icsContent.push(`DTSTAMP:${dtstamp}`);
          icsContent.push(`DTSTART:${dtstart}`);
          icsContent.push(`DTEND:${dtend}`);
          icsContent.push(`SUMMARY:${ev.icon} ${ev.title}`);
          icsContent.push(`DESCRIPTION:${ev.subtext || ''}\\nAuto-scheduled by GreenMaster AI.`);
          icsContent.push('STATUS:CONFIRMED');
          icsContent.push('BEGIN:VALARM');
          icsContent.push('TRIGGER:-PT30M');
          icsContent.push('ACTION:DISPLAY');
          icsContent.push(`DESCRIPTION:Reminder: ${ev.title}`);
          icsContent.push('END:VALARM');
          icsContent.push('END:VEVENT');
        });
      });
    } else if (plan && plan.actionPlan) {
      const horizons = [
        { key: 'oneWeek', label: '1 Week Target', dayOffset: 3 },
        { key: 'twoWeeks', label: '2 Weeks Target', dayOffset: 10 },
        { key: 'oneMonth', label: '1 Month Target', dayOffset: 25 }
      ];

      horizons.forEach(h => {
        const tasks = plan.actionPlan[h.key] || [];
        tasks.forEach((task, idx) => {
          const eventDate = new Date();
          eventDate.setDate(eventDate.getDate() + h.dayOffset + (idx * 2));
          
          const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
          const yyyymmdd = eventDate.toISOString().split('T')[0].replace(/-/g, '');
          const dtstart = `${yyyymmdd}T080000`;
          const dtend = `${yyyymmdd}T090000`;
          const uid = `gm-${Date.now()}-${h.key}-${idx}@greenmaster.ai`;

          icsContent.push('BEGIN:VEVENT');
          icsContent.push(`UID:${uid}`);
          icsContent.push(`DTSTAMP:${dtstamp}`);
          icsContent.push(`DTSTART:${dtstart}`);
          icsContent.push(`DTEND:${dtend}`);
          icsContent.push(`SUMMARY:🌱 Lawn: ${task.task}`);
          icsContent.push(`DESCRIPTION:[${task.category} - ${task.urgency} Urgency] ${task.tip || ''}\\nGenerated by GreenMaster AI Planner.`);
          icsContent.push('STATUS:CONFIRMED');
          icsContent.push('END:VEVENT');
        });
      });
    }

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'GreenMaster_Lawn_Schedule.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
