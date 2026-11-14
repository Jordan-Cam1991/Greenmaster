/**
 * Agronomic Planner Engine for GreenMaster AI
 * Dynamically computes actionable schedules across 6 time horizons:
 * 1. Next Week (7 Days)
 * 2. Two Weeks (14 Days)
 * 3. One Month (30 Days)
 * 4. One Quarter (3 Months)
 * 5. Half Year (6 Months)
 * 6. One Year (12 Months)
 *
 * Integrates comprehensive onboarding history (last mow, last fertilise,
 * pre-emergent status, mower type, and product recommendations).
 */
const PlannerEngine = {
  generateDynamicPlan({ cvMetrics, weedLevel, weeds, diseaseOrStress, profile }) {
    const tier = profile.tier || 'semi_pro';
    const grass = profile.grassType || 'Bermuda / Couch';
    const hoc = Number(profile.hoc) || 15;
    const history = profile.history || {};
    const equipment = profile.equipment || [];
    const fertilisers = profile.fertilisers || [];
    const herbicides = profile.herbicides || [];

    const hasReel = equipment.some(e => e.toLowerCase().includes('reel') || e.toLowerCase().includes('cylinder'));
    const hasSprayer = equipment.some(e => e.toLowerCase().includes('sprayer'));
    const hasDethatcher = equipment.some(e => e.toLowerCase().includes('dethatch') || e.toLowerCase().includes('scarifi'));
    const hasAerator = equipment.some(e => e.toLowerCase().includes('aera'));
    const hasPgr = profile.specialTreatments?.some(t => t.toLowerCase().includes('pgr') || t.toLowerCase().includes('primo'));
    const hasPreEmergent = herbicides.some(h => h.toLowerCase().includes('prodiamine') || h.toLowerCase().includes('barricade') || h.toLowerCase().includes('pre-emergent'));
    const hasWettingAgent = profile.specialTreatments?.some(t => t.toLowerCase().includes('wetting') || t.toLowerCase().includes('surfactant'));
    const hasFertiliser = fertilisers.length > 0;

    // 1. ONE WEEK (Immediate 7-Day Actions)
    const oneWeek = [];

    // Check if new to lawn care & missing essentials -> suggest purchasing starter pack
    if (!hasFertiliser) {
      oneWeek.push({
        id: 'w1_shop_fert',
        task: '🛒 Procure Essential Lawn Nutrition Kit',
        urgency: 'Critical',
        category: 'Fertiliser',
        tip: 'You indicated you do not have fertilisers yet. Visit lawntips.com to get a balanced slow-release granular or foliar starter pack (e.g. Lawn Tips Growth / Foliar Duo).'
      });
    }

    // Pre-emergent urgent check from consultation
    if (history.preEmergentStatus === 'none' || history.preEmergentStatus === 'over_6m') {
      oneWeek.push({
        id: 'w1_urgent_pre_emergent',
        task: hasPreEmergent ? 'Apply Pre-Emergent barrier (Prodiamine / Spartan)' : '🛒 Order & Apply Pre-Emergent Barrier',
        urgency: 'Critical',
        category: 'Protection',
        tip: hasPreEmergent 
          ? 'Consultation indicates your lawn has no active weed barrier. Apply immediately and water in with 12mm to seal the soil.' 
          : 'Crucial: Get Prodiamine / Barricade from lawntips.com to block weed seeds before germination season.'
      });
    }

    // Mowing plan based on mower type and last mow
    const lastMowDays = Number(history.lastMowDays) || 3;
    if (lastMowDays >= 10) {
      oneWeek.push({
        id: 'w1_step_down_mow',
        task: `Gradual Step-Down Mow (Do not scalp)`,
        urgency: 'High',
        category: 'Mowing',
        tip: `Since your last cut was ${lastMowDays} days ago, cut high first. Wait 3 days, then bring down to target ${hoc}mm adhering strictly to the 1/3rd rule.`
      });
    } else {
      if (tier === 'full_pro') {
        oneWeek.push({
          id: 'w1_mow_1',
          task: hasReel ? `Cylinder mow at ${hoc}mm (Pattern 1)` : `Mow at ${hoc}mm with sharp blade`,
          urgency: 'Critical',
          category: 'Mowing',
          tip: 'Mow early in the morning once dew dries. Empty catcher to maintain uniform surface roll.'
        });
        oneWeek.push({
          id: 'w1_mow_2',
          task: hasReel ? `Cross-cut cylinder mow at 90° angle` : `Mid-week clean-up mow`,
          urgency: 'High',
          category: 'Mowing',
          tip: 'Promotes tight lateral rhizome/stolon tillering for carpet-like bowling green density.'
        });
        if (hasPgr) {
          oneWeek.push({
            id: 'w1_pgr',
            task: 'Primo Maxx (PGR) check & GDD calculation',
            urgency: 'Medium',
            category: 'Chemical',
            tip: 'Apply at 200 Growing Degree Days to suppress vertical surge and double root density.'
          });
        }
      } else if (tier === 'semi_pro') {
        oneWeek.push({
          id: 'w1_mow',
          task: `Mow at ${hoc}mm with rear roller striping`,
          urgency: 'High',
          category: 'Mowing',
          tip: 'Keep cut height consistent. Never cut more than 1/3 of the blade length in one pass.'
        });
      } else {
        oneWeek.push({
          id: 'w1_mow_low',
          task: `Rotary mow at ${hoc}mm`,
          urgency: 'Medium',
          category: 'Mowing',
          tip: 'Check that blade is sharp to prevent frayed brown tips.'
        });
      }
    }

    // Irrigation check for week 1
    if (cvMetrics.brownRatio > 0.08) {
      oneWeek.push({
        id: 'w1_deep_soak',
        task: 'Deep soak watering (15mm) & wetting agent flush',
        urgency: 'Critical',
        category: 'Watering',
        tip: 'Canopy dehydration spotted. Run sprinklers for 35 mins at sunrise.'
      });
    } else {
      oneWeek.push({
        id: 'w1_water',
        task: `Irrigation cycle (${profile.wateringFreq})`,
        urgency: 'Medium',
        category: 'Watering',
        tip: 'Infrequent deep dawn soaks encourage roots to dig deep into the subsoil profile.'
      });
    }

    // Weeds check for week 1
    if (weedLevel.includes('Moderate') || weedLevel.includes('High')) {
      oneWeek.push({
        id: 'w1_weeds',
        task: `Spot spray detected weeds (${weeds.slice(0, 2).join(', ')})`,
        urgency: 'High',
        category: 'Weed Control',
        tip: 'Use selective broadleaf herbicide (Bow & Arrow / Dicamba). Spray during calm, cool morning conditions.'
      });
    }

    // 2. TWO WEEKS (Short-term 14-Day Horizon)
    const twoWeeks = [];
    const lastFertDays = Number(history.lastFertDays) || 30;

    if (lastFertDays < 14) {
      twoWeeks.push({
        id: 'w2_feed_resting',
        task: 'Soil Hydration & Microbial Soak (Skip Heavy Nitrogen)',
        urgency: 'Low',
        category: 'Soil',
        tip: `Your last fertiliser application was ${lastFertDays} days ago and is still active. Let roots absorb nutrients without risk of salt burn.`
      });
    } else {
      if (tier === 'full_pro') {
        twoWeeks.push({
          id: 'w2_foliar',
          task: 'Liquid foliar spoon-feed (N-P-K + Chelated Iron + Kelp)',
          urgency: 'High',
          category: 'Fertiliser',
          tip: 'Spoon feeding prevents growth surges while unlocking an unmistakable tournament dark emerald pop.'
        });
        twoWeeks.push({
          id: 'w2_groom',
          task: 'Verti-cut / light grooming reel pass',
          urgency: 'Medium',
          category: 'Renovation',
          tip: 'Slices horizontal grain and lifts recumbent runners before cylinder cut.'
        });
      } else if (tier === 'semi_pro') {
        twoWeeks.push({
          id: 'w2_feed',
          task: hasSprayer ? 'Foliar liquid feed with Iron & Nitrogen' : 'Light granular fertiliser application',
          urgency: 'Medium',
          category: 'Fertiliser',
          tip: 'Apply evenly. Water in thoroughly within 24 hours to prevent leaf scorch.'
        });
        twoWeeks.push({
          id: 'w2_edge',
          task: 'Edge trimming & trench crisping',
          urgency: 'Low',
          category: 'Detailing',
          tip: 'Crisp 90-degree edge around driveways and garden beds amplifies visual contrast.'
        });
      } else {
        twoWeeks.push({
          id: 'w2_feed_low',
          task: 'Apply slow-release lawn food (1 application per 8 weeks)',
          urgency: 'Low',
          category: 'Fertiliser',
          tip: 'Broadcast granular feed evenly across the yard and water in.'
        });
      }
    }

    // 3. ONE MONTH (30-Day Milestone)
    const oneMonth = [];
    oneMonth.push({
      id: 'm1_wetting',
      task: hasWettingAgent ? 'Apply Tournament-Grade Soil Wetting Agent' : '🛒 Get & Apply Wetting Agent (Hydra-Flo / Tournament)',
      urgency: 'High',
      category: 'Soil',
      tip: 'Breaks water surface tension, prevents hydrophobic dry spots, and cuts water waste by 30%. (Available at lawntips.com).'
    });

    if (tier === 'full_pro' || tier === 'semi_pro') {
      oneMonth.push({
        id: 'm1_biostimulant',
        task: 'Humic acid & Seaweed biostimulant drench',
        urgency: 'Medium',
        category: 'Soil',
        tip: 'Feeds soil microbes, builds cation exchange capacity (CEC), and drives massive root mass.'
      });
      oneMonth.push({
        id: 'm1_blade_check',
        task: hasReel ? 'Cylinder mower backlapping with 120-grit compound' : 'Rotary blade sharpening & balancing',
        urgency: 'Medium',
        category: 'Equipment',
        tip: 'A surgical clean cut prevents disease pathogens and leaves glossy, diamond-sharp leaf tips.'
      });
    } else {
      oneMonth.push({
        id: 'm1_weed_check',
        task: 'General weed audit & hand-pulling escapes',
        urgency: 'Low',
        category: 'Weed Control',
        tip: 'Walk the perimeter and pull any breakthrough weeds before seed heads mature.'
      });
    }

    // 4. ONE QUARTER (3 Months / Seasonal Transition)
    const oneQuarter = [];
    oneQuarter.push({
      id: 'q1_pre_emergent',
      task: 'Pre-Emergent booster barrier (Prodiamine / Barricade)',
      urgency: 'Critical',
      category: 'Protection',
      tip: 'Maintains the chemical barrier in top 10mm of soil to block next seasonal weed flush.'
    });
    if (tier === 'full_pro') {
      oneQuarter.push({
        id: 'q1_sand_dress',
        task: 'Micro sand topdress (1-2mm) & levelling lute roll',
        urgency: 'High',
        category: 'Levelling',
        tip: 'Use kiln-dried washed USGA golf sand to maintain absolute bowling green flatness.'
      });
      oneQuarter.push({
        id: 'q1_aeration',
        task: 'Solid tine aeration / spiking',
        urgency: 'Medium',
        category: 'Soil',
        tip: 'Relieves surface tension and channels oxygen directly into the root zone.'
      });
    } else {
      oneQuarter.push({
        id: 'q1_seasonal_feed',
        task: 'Seasonal Granular Boost (High Potassium for stress tolerance)',
        urgency: 'High',
        category: 'Fertiliser',
        tip: 'Potassium strengthens cell walls against heat, drought, or winter frost.'
      });
    }

    // 5. HALF YEAR (6 Months / Mid-Year Renovation & Prep)
    const halfYear = [];
    if (tier === 'full_pro' || tier === 'semi_pro') {
      halfYear.push({
        id: 'h1_core_aeration',
        task: hasAerator ? 'Hollow core aeration (pulling 2-inch cores)' : 'Hire or perform deep core aeration',
        urgency: 'High',
        category: 'Renovation',
        tip: 'Extracts soil compaction plugs and creates room for fresh sand and root elongation.'
      });
      halfYear.push({
        id: 'h1_dethatch',
        task: hasDethatcher ? 'Light scarify to clean organic thatch layer' : 'Rake thatch buildup',
        urgency: 'Medium',
        category: 'Renovation',
        tip: 'Keeps organic thatch layer under 10mm so water and air reach soil effortlessly.'
      });
    } else {
      halfYear.push({
        id: 'h1_soil_check',
        task: 'Soil pH and compaction probe test',
        urgency: 'Medium',
        category: 'Soil',
        tip: 'Target pH 6.2 - 6.8 for optimal nutrient bioavailability.'
      });
    }
    halfYear.push({
      id: 'h1_sprinkler_audit',
      task: 'Catch-cup sprinkler audit & uniformity test',
      urgency: 'Medium',
      category: 'Watering',
      tip: 'Place catch-cups to measure exact precipitation rate (mm per hour) across zones.'
    });

    // 6. ONE YEAR (12 Months / Annual Master Reset & Budget)
    const oneYear = [];
    oneYear.push({
      id: 'y1_annual_renovation',
      task: 'Spring Reset: Scalp to ground, heavy scarify & core aerate',
      urgency: 'Critical',
      category: 'Renovation',
      tip: 'The annual master reset. Strips old woody stems and forces fresh dense emerald shoots.'
    });
    oneYear.push({
      id: 'y1_lab_soil_test',
      task: 'Comprehensive Lab Soil Test (NPK, pH, Micronutrients, CEC)',
      urgency: 'High',
      category: 'Soil',
      tip: 'Eliminates guesswork. Calibrates your annual Nitrogen budget (g/m²).'
    });
    oneYear.push({
      id: 'y1_full_equipment_service',
      task: 'Mower overhaul, cylinder spin grind, bedknife face & engine service',
      urgency: 'High',
      category: 'Equipment',
      tip: 'Precision cut tolerances require true cylinder geometry and bedknife relief angles.'
    });

    return {
      oneWeek,
      twoWeeks,
      oneMonth,
      oneQuarter,
      halfYear,
      oneYear
    };
  }
};
