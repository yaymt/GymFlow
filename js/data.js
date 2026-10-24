// Built-in exercise library and starter plan templates.
// type: 'weight' (weight × reps) | 'bodyweight' (reps, optional extra weight) | 'time' (seconds) | 'cardio' (minutes + km)

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'cardio', 'full'];

const ex = (id, en, ar, muscle, equip, type = 'weight') => ({ id, en, ar, muscle, equip, type, builtin: true });

export const EXERCISES = [
  // Chest
  ex('bench', 'Barbell Bench Press', 'بنش برس بالبار', 'chest', 'barbell'),
  ex('incline_bench', 'Incline Barbell Bench', 'بنش علوي بالبار', 'chest', 'barbell'),
  ex('db_bench', 'Dumbbell Bench Press', 'بنش دمبل', 'chest', 'dumbbell'),
  ex('incline_db', 'Incline Dumbbell Press', 'ضغط علوي دمبل', 'chest', 'dumbbell'),
  ex('decline_bench', 'Decline Bench Press', 'بنش سفلي', 'chest', 'barbell'),
  ex('chest_fly', 'Dumbbell Fly', 'تفتيح دمبل', 'chest', 'dumbbell'),
  ex('cable_fly', 'Cable Crossover', 'تفتيح كيبل', 'chest', 'cable'),
  ex('pec_deck', 'Pec Deck', 'جهاز الفراشة', 'chest', 'machine'),
  ex('chest_press', 'Machine Chest Press', 'جهاز ضغط الصدر', 'chest', 'machine'),
  ex('pushup', 'Push-up', 'ضغط', 'chest', 'bodyweight', 'bodyweight'),
  ex('dips', 'Dips', 'متوازي', 'triceps', 'bodyweight', 'bodyweight'),
  // Back
  ex('deadlift', 'Deadlift', 'رفعة ميتة', 'back', 'barbell'),
  ex('pullup', 'Pull-up', 'عقلة', 'back', 'bodyweight', 'bodyweight'),
  ex('chinup', 'Chin-up', 'عقلة قبضة عكسية', 'back', 'bodyweight', 'bodyweight'),
  ex('lat_pulldown', 'Lat Pulldown', 'سحب أمامي', 'back', 'cable'),
  ex('barbell_row', 'Barbell Row', 'تجديف بالبار', 'back', 'barbell'),
  ex('db_row', 'One-Arm Dumbbell Row', 'تجديف دمبل بيد واحدة', 'back', 'dumbbell'),
  ex('seated_row', 'Seated Cable Row', 'سحب أرضي كيبل', 'back', 'cable'),
  ex('tbar_row', 'T-Bar Row', 'تجديف تي بار', 'back', 'barbell'),
  ex('machine_row', 'Machine Row', 'جهاز التجديف', 'back', 'machine'),
  ex('straight_pulldown', 'Straight-Arm Pulldown', 'سحب بذراع مستقيمة', 'back', 'cable'),
  ex('back_ext', 'Back Extension', 'تمديد الظهر', 'back', 'bodyweight', 'bodyweight'),
  ex('shrug', 'Shrugs', 'ترابيس', 'back', 'dumbbell'),
  // Shoulders
  ex('ohp', 'Overhead Press', 'ضغط كتف بالبار', 'shoulders', 'barbell'),
  ex('db_shoulder', 'Dumbbell Shoulder Press', 'ضغط كتف دمبل', 'shoulders', 'dumbbell'),
  ex('lateral_raise', 'Lateral Raise', 'رفرفة جانبي', 'shoulders', 'dumbbell'),
  ex('cable_lateral', 'Cable Lateral Raise', 'رفرفة جانبي كيبل', 'shoulders', 'cable'),
  ex('front_raise', 'Front Raise', 'رفرفة أمامي', 'shoulders', 'dumbbell'),
  ex('rear_delt', 'Rear Delt Fly', 'كتف خلفي', 'shoulders', 'dumbbell'),
  ex('face_pull', 'Face Pull', 'فيس بول', 'shoulders', 'cable'),
  ex('arnold', 'Arnold Press', 'ضغط أرنولد', 'shoulders', 'dumbbell'),
  // Arms
  ex('bb_curl', 'Barbell Curl', 'بايسبس بالبار', 'biceps', 'barbell'),
  ex('db_curl', 'Dumbbell Curl', 'بايسبس دمبل', 'biceps', 'dumbbell'),
  ex('hammer_curl', 'Hammer Curl', 'هامر', 'biceps', 'dumbbell'),
  ex('preacher', 'Preacher Curl', 'بايسبس ارتكاز', 'biceps', 'machine'),
  ex('cable_curl', 'Cable Curl', 'بايسبس كيبل', 'biceps', 'cable'),
  ex('incline_curl', 'Incline Dumbbell Curl', 'بايسبس مائل', 'biceps', 'dumbbell'),
  ex('pushdown', 'Triceps Pushdown', 'ترايسبس كيبل', 'triceps', 'cable'),
  ex('skull', 'Skull Crusher', 'ترايسبس فرنسي', 'triceps', 'barbell'),
  ex('oh_ext', 'Overhead Triceps Extension', 'ترايسبس خلف الرأس', 'triceps', 'dumbbell'),
  ex('cgbp', 'Close-Grip Bench Press', 'بنش قبضة ضيقة', 'triceps', 'barbell'),
  ex('kickback', 'Triceps Kickback', 'ترايسبس ركلة', 'triceps', 'dumbbell'),
  // Legs
  ex('squat', 'Back Squat', 'سكوات', 'quads', 'barbell'),
  ex('front_squat', 'Front Squat', 'سكوات أمامي', 'quads', 'barbell'),
  ex('leg_press', 'Leg Press', 'دفع الأرجل', 'quads', 'machine'),
  ex('hack_squat', 'Hack Squat', 'هاك سكوات', 'quads', 'machine'),
  ex('leg_ext', 'Leg Extension', 'رفرفة أمامي للأرجل', 'quads', 'machine'),
  ex('lunge', 'Walking Lunge', 'طعنات', 'quads', 'dumbbell'),
  ex('bulgarian', 'Bulgarian Split Squat', 'سكوات بلغاري', 'quads', 'dumbbell'),
  ex('goblet', 'Goblet Squat', 'سكوات كأس', 'quads', 'dumbbell'),
  ex('rdl', 'Romanian Deadlift', 'رفعة رومانية', 'hamstrings', 'barbell'),
  ex('leg_curl', 'Lying Leg Curl', 'رفرفة خلفي للأرجل', 'hamstrings', 'machine'),
  ex('seated_leg_curl', 'Seated Leg Curl', 'رفرفة خلفي جالس', 'hamstrings', 'machine'),
  ex('hip_thrust', 'Hip Thrust', 'هيب ثرست', 'glutes', 'barbell'),
  ex('glute_kick', 'Cable Glute Kickback', 'ركلة أرداف كيبل', 'glutes', 'cable'),
  ex('abductor', 'Hip Abductor', 'جهاز الأبعاد', 'glutes', 'machine'),
  ex('adductor', 'Hip Adductor', 'جهاز الضم', 'quads', 'machine'),
  ex('calf_raise', 'Standing Calf Raise', 'سمانة واقف', 'calves', 'machine'),
  ex('seated_calf', 'Seated Calf Raise', 'سمانة جالس', 'calves', 'machine'),
  // Core
  ex('plank', 'Plank', 'بلانك', 'core', 'bodyweight', 'time'),
  ex('crunch', 'Crunch', 'كرنش', 'core', 'bodyweight', 'bodyweight'),
  ex('hanging_raise', 'Hanging Leg Raise', 'رفع الأرجل معلّق', 'core', 'bodyweight', 'bodyweight'),
  ex('cable_crunch', 'Cable Crunch', 'كرنش كيبل', 'core', 'cable'),
  ex('russian_twist', 'Russian Twist', 'تويست روسي', 'core', 'bodyweight', 'bodyweight'),
  ex('ab_wheel', 'Ab Wheel Rollout', 'عجلة البطن', 'core', 'bodyweight', 'bodyweight'),
  // Cardio & full body
  ex('treadmill', 'Treadmill', 'سير كهربائي', 'cardio', 'machine', 'cardio'),
  ex('bike', 'Stationary Bike', 'دراجة ثابتة', 'cardio', 'machine', 'cardio'),
  ex('elliptical', 'Elliptical', 'أوبتكال', 'cardio', 'machine', 'cardio'),
  ex('rowing', 'Rowing Machine', 'جهاز التجديف الهوائي', 'cardio', 'machine', 'cardio'),
  ex('stairs', 'Stair Climber', 'جهاز الدرج', 'cardio', 'machine', 'cardio'),
  ex('jump_rope', 'Jump Rope', 'نط الحبل', 'cardio', 'bodyweight', 'time'),
  ex('kb_swing', 'Kettlebell Swing', 'أرجحة الكتلبل', 'full', 'kettlebell'),
  ex('clean', 'Power Clean', 'كلين', 'full', 'barbell'),
  ex('farmer', "Farmer's Walk", 'مشي المزارع', 'full', 'dumbbell', 'time'),
  ex('burpee', 'Burpees', 'بيربي', 'full', 'bodyweight', 'bodyweight'),
];

// Plan templates: each day = { name: {en, ar}, weekday: 0-6 (Sun=0) or null, items: [[exerciseId, sets, reps]] }
const d = (en, ar, weekday, items) => ({ name: { en, ar }, weekday, items });

export const TEMPLATES = [
  {
    id: 'ppl',
    name: { en: 'Push / Pull / Legs', ar: 'دفع / سحب / أرجل' },
    desc: { en: '6 days, each muscle twice a week', ar: '٦ أيام، كل عضلة مرتين في الأسبوع' },
    days: [
      d('Push', 'دفع', 0, [['bench', 4, '6-8'], ['incline_db', 3, '8-10'], ['db_shoulder', 3, '8-10'], ['lateral_raise', 4, '12-15'], ['pushdown', 3, '10-12'], ['oh_ext', 3, '10-12']]),
      d('Pull', 'سحب', 1, [['deadlift', 3, '5'], ['pullup', 4, '6-10'], ['barbell_row', 3, '8-10'], ['face_pull', 3, '15'], ['bb_curl', 3, '10'], ['hammer_curl', 3, '12']]),
      d('Legs', 'أرجل', 2, [['squat', 4, '6-8'], ['rdl', 3, '8-10'], ['leg_press', 3, '10-12'], ['leg_curl', 3, '12'], ['calf_raise', 4, '12-15'], ['plank', 3, '45']]),
      d('Push 2', 'دفع ٢', 3, [['ohp', 4, '6-8'], ['db_bench', 3, '8-10'], ['cable_fly', 3, '12'], ['lateral_raise', 4, '15'], ['dips', 3, '8-12'], ['skull', 3, '10']]),
      d('Pull 2', 'سحب ٢', 4, [['lat_pulldown', 4, '8-10'], ['seated_row', 3, '10'], ['db_row', 3, '10'], ['rear_delt', 3, '15'], ['incline_curl', 3, '10'], ['cable_curl', 3, '12']]),
      d('Legs 2', 'أرجل ٢', 5, [['front_squat', 4, '6-8'], ['hip_thrust', 3, '8-10'], ['bulgarian', 3, '10'], ['leg_ext', 3, '12'], ['seated_calf', 4, '15'], ['hanging_raise', 3, '12']]),
    ],
  },
  {
    id: 'ul',
    name: { en: 'Upper / Lower', ar: 'علوي / سفلي' },
    desc: { en: '4 days, balanced strength and size', ar: '٤ أيام، توازن بين القوة والحجم' },
    days: [
      d('Upper A', 'علوي أ', 0, [['bench', 4, '5-6'], ['barbell_row', 4, '6-8'], ['ohp', 3, '8'], ['lat_pulldown', 3, '10'], ['bb_curl', 2, '10'], ['pushdown', 2, '12']]),
      d('Lower A', 'سفلي أ', 1, [['squat', 4, '5-6'], ['rdl', 3, '8'], ['leg_press', 3, '10'], ['leg_curl', 3, '12'], ['calf_raise', 4, '12']]),
      d('Upper B', 'علوي ب', 3, [['incline_db', 4, '8-10'], ['pullup', 4, '6-10'], ['db_shoulder', 3, '10'], ['seated_row', 3, '10'], ['lateral_raise', 3, '15'], ['hammer_curl', 2, '12']]),
      d('Lower B', 'سفلي ب', 4, [['deadlift', 3, '5'], ['hip_thrust', 3, '8-10'], ['bulgarian', 3, '10'], ['leg_ext', 3, '12'], ['seated_calf', 4, '15'], ['plank', 3, '60']]),
    ],
  },
  {
    id: 'fb',
    name: { en: 'Full Body ×3', ar: 'جسم كامل ×٣' },
    desc: { en: '3 days, ideal for beginners', ar: '٣ أيام، مناسب للمبتدئين' },
    days: [
      d('Full A', 'كامل أ', 0, [['squat', 3, '8'], ['bench', 3, '8'], ['barbell_row', 3, '8'], ['lateral_raise', 2, '12'], ['plank', 3, '40']]),
      d('Full B', 'كامل ب', 2, [['deadlift', 3, '5'], ['ohp', 3, '8'], ['lat_pulldown', 3, '10'], ['lunge', 2, '10'], ['db_curl', 2, '12']]),
      d('Full C', 'كامل ج', 4, [['leg_press', 3, '10'], ['incline_db', 3, '10'], ['seated_row', 3, '10'], ['leg_curl', 2, '12'], ['pushdown', 2, '12']]),
    ],
  },
  {
    id: 'bro',
    name: { en: 'Body-part split', ar: 'عضلة لكل يوم' },
    desc: { en: '5 days, one muscle group per day', ar: '٥ أيام، مجموعة عضلية لكل يوم' },
    days: [
      d('Chest', 'صدر', 0, [['bench', 4, '8'], ['incline_db', 3, '10'], ['chest_fly', 3, '12'], ['cable_fly', 3, '15'], ['dips', 3, '10']]),
      d('Back', 'ظهر', 1, [['deadlift', 3, '5'], ['pullup', 3, '8'], ['barbell_row', 3, '10'], ['seated_row', 3, '12'], ['shrug', 3, '12']]),
      d('Shoulders', 'أكتاف', 2, [['ohp', 4, '8'], ['lateral_raise', 4, '15'], ['rear_delt', 3, '15'], ['front_raise', 3, '12'], ['face_pull', 3, '15']]),
      d('Legs', 'أرجل', 3, [['squat', 4, '8'], ['leg_press', 3, '12'], ['rdl', 3, '10'], ['leg_curl', 3, '12'], ['calf_raise', 4, '15']]),
      d('Arms', 'ذراعين', 4, [['bb_curl', 3, '10'], ['skull', 3, '10'], ['hammer_curl', 3, '12'], ['pushdown', 3, '12'], ['incline_curl', 3, '12'], ['oh_ext', 3, '12']]),
    ],
  },
];

export const MEASURE_KEYS = ['chest', 'waist', 'hips', 'arm', 'thigh', 'neck', 'calf', 'bodyfat'];
