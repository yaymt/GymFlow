// Built-in exercise library and starter plan templates.
// type:
//   'weight'     weight × reps            (barbell, dumbbell, machines)
//   'bodyweight' reps, optional extra kg  (push-ups, pull-ups, dips…)
//   'time'       duration in seconds      (plank, wall sit, jump rope)
//   'carry'      weight × distance (m)    (farmer's walk, sled push)
//   'cardio'     minutes + distance + one optional extra (incline / level), no sets, no rest timer
// For cardio: dist = 'km' | 'm' | 'floors' | null, extra = key of CARDIO_EXTRAS | null

export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'core', 'cardio', 'full'];

// Legs is one section in the exercise list; the four parts below still count separately in progress stats.
export const LEG_MUSCLES = ['quads', 'hamstrings', 'glutes', 'calves'];
export const GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'cardio', 'full'];
export const inGroup = (muscle, group) => (group === 'legs' ? LEG_MUSCLES.includes(muscle) : muscle === group);

export const CARDIO_EXTRAS = {
  incline: { ar: 'الميل', en: 'Incline', unit: '%' },
  level: { ar: 'المستوى', en: 'Level', unit: '' },
  kcal: { ar: 'سعرات', en: 'kcal', unit: '' },
};

const ex = (id, en, ar, muscle, equip, type = 'weight', more = {}) => ({ id, en, ar, muscle, equip, type, builtin: true, ...more });

export const EXERCISES = [
  // Chest
  ex('bench', 'Barbell Bench Press', 'بنش برس بالبار', 'chest', 'barbell'),
  ex('incline_bench', 'Incline Barbell Bench Press', 'بنش علوي بالبار', 'chest', 'barbell'),
  ex('db_bench', 'Dumbbell Bench Press', 'بنش برس دمبل', 'chest', 'dumbbell'),
  ex('incline_db', 'Incline Dumbbell Press', 'بنش علوي دمبل', 'chest', 'dumbbell'),
  ex('decline_bench', 'Decline Barbell Bench Press', 'بنش سفلي بالبار', 'chest', 'barbell'),
  ex('chest_fly', 'Dumbbell Chest Fly', 'تفتيح صدر دمبل', 'chest', 'dumbbell'),
  ex('cable_fly', 'Cable Fly', 'تفتيح صدر كيبل', 'chest', 'cable'),
  ex('pec_deck', 'Pec Deck Fly', 'جهاز الفراشة', 'chest', 'machine'),
  ex('chest_press', 'Machine Chest Press', 'جهاز ضغط الصدر', 'chest', 'machine'),
  ex('pushup', 'Push-Up', 'ضغط (بوش أب)', 'chest', 'bodyweight', 'bodyweight'),
  ex('dips', 'Parallel Bar Dips', 'متوازي (دبس)', 'triceps', 'bodyweight', 'bodyweight'),
  // Back
  ex('deadlift', 'Conventional Deadlift', 'رفعة ميتة', 'back', 'barbell'),
  ex('pullup', 'Pull-Up', 'عقلة', 'back', 'bodyweight', 'bodyweight'),
  ex('chinup', 'Chin-Up', 'عقلة قبضة عكسية', 'back', 'bodyweight', 'bodyweight'),
  ex('lat_pulldown', 'Lat Pulldown', 'سحب أمامي (لات بول داون)', 'back', 'cable'),
  ex('barbell_row', 'Barbell Bent-Over Row', 'تجديف بالبار', 'back', 'barbell'),
  ex('db_row', 'One-Arm Dumbbell Row', 'تجديف دمبل بيد واحدة', 'back', 'dumbbell'),
  ex('seated_row', 'Seated Cable Row', 'تجديف كيبل جالس', 'back', 'cable'),
  ex('tbar_row', 'T-Bar Row', 'تجديف تي بار', 'back', 'barbell'),
  ex('machine_row', 'Machine Row', 'جهاز تجديف الظهر', 'back', 'machine'),
  ex('straight_pulldown', 'Straight-Arm Pulldown', 'سحب بذراعين مستقيمتين', 'back', 'cable'),
  ex('back_ext', 'Back Extension (Hyperextension)', 'تمديد الظهر (هايبر إكستنشن)', 'back', 'bodyweight', 'bodyweight'),
  ex('shrug', 'Dumbbell Shrug', 'رفع الأكتاف (ترابيس) دمبل', 'back', 'dumbbell'),
  // Shoulders
  ex('ohp', 'Overhead Barbell Press', 'ضغط كتف بالبار', 'shoulders', 'barbell'),
  ex('db_shoulder', 'Dumbbell Shoulder Press', 'ضغط كتف دمبل', 'shoulders', 'dumbbell'),
  ex('lateral_raise', 'Dumbbell Lateral Raise', 'رفرفة جانبي دمبل', 'shoulders', 'dumbbell'),
  ex('cable_lateral', 'Cable Lateral Raise', 'رفرفة جانبي كيبل', 'shoulders', 'cable'),
  ex('front_raise', 'Dumbbell Front Raise', 'رفرفة أمامي دمبل', 'shoulders', 'dumbbell'),
  ex('rear_delt', 'Dumbbell Rear Delt Fly', 'رفرفة خلفي (كتف خلفي) دمبل', 'shoulders', 'dumbbell'),
  ex('face_pull', 'Cable Face Pull', 'فيس بول كيبل', 'shoulders', 'cable'),
  ex('arnold', 'Arnold Press', 'ضغط أرنولد', 'shoulders', 'dumbbell'),
  // Arms
  ex('bb_curl', 'Barbell Curl', 'بايسبس بالبار', 'biceps', 'barbell'),
  ex('db_curl', 'Dumbbell Curl', 'بايسبس دمبل', 'biceps', 'dumbbell'),
  ex('hammer_curl', 'Hammer Curl', 'بايسبس هامر دمبل', 'biceps', 'dumbbell'),
  ex('preacher', 'Preacher Curl', 'بايسبس بريتشر (ارتكاز)', 'biceps', 'machine'),
  ex('cable_curl', 'Cable Curl', 'بايسبس كيبل', 'biceps', 'cable'),
  ex('incline_curl', 'Incline Dumbbell Curl', 'بايسبس دمبل على مقعد مائل', 'biceps', 'dumbbell'),
  ex('pushdown', 'Triceps Pushdown', 'ترايسبس كيبل (بوش داون)', 'triceps', 'cable'),
  ex('skull', 'Skull Crusher', 'ترايسبس بالبار استلقاء (سكل كراشر)', 'triceps', 'barbell'),
  ex('oh_ext', 'Overhead Dumbbell Triceps Extension', 'ترايسبس دمبل خلف الرأس', 'triceps', 'dumbbell'),
  ex('cgbp', 'Close-Grip Bench Press', 'بنش برس قبضة ضيقة', 'triceps', 'barbell'),
  ex('kickback', 'Dumbbell Triceps Kickback', 'ترايسبس كيك باك دمبل', 'triceps', 'dumbbell'),
  // Legs: quads
  ex('squat', 'Barbell Back Squat', 'سكوات خلفي بالبار', 'quads', 'barbell'),
  ex('front_squat', 'Barbell Front Squat', 'سكوات أمامي بالبار', 'quads', 'barbell'),
  ex('smith_squat', 'Smith Machine Squat', 'سكوات على جهاز سميث', 'quads', 'machine'),
  ex('goblet', 'Goblet Squat', 'سكوات جوبلت', 'quads', 'dumbbell'),
  ex('hack_squat', 'Hack Squat', 'هاك سكوات', 'quads', 'machine'),
  ex('leg_press', 'Leg Press', 'ضغط الأرجل (ليج برس)', 'quads', 'machine'),
  ex('leg_ext', 'Leg Extension', 'تمديد الأرجل (فخذ أمامي)', 'quads', 'machine'),
  ex('lunge', 'Dumbbell Walking Lunge', 'اندفاع مشي بالدمبل (لانجز)', 'quads', 'dumbbell'),
  ex('db_lunge', 'Dumbbell Lunge', 'اندفاع ثابت بالدمبل', 'quads', 'dumbbell'),
  ex('reverse_lunge', 'Dumbbell Reverse Lunge', 'اندفاع عكسي بالدمبل', 'quads', 'dumbbell'),
  ex('bulgarian', 'Bulgarian Split Squat', 'سكوات بلغاري', 'quads', 'dumbbell'),
  ex('step_up', 'Dumbbell Step-Up', 'صعود الصندوق بالدمبل', 'quads', 'dumbbell'),
  ex('bw_squat', 'Bodyweight Squat', 'سكوات بوزن الجسم', 'quads', 'bodyweight', 'bodyweight'),
  ex('jump_squat', 'Jump Squat', 'سكوات قفز', 'quads', 'bodyweight', 'bodyweight'),
  ex('box_jump', 'Box Jump', 'قفز على الصندوق', 'quads', 'bodyweight', 'bodyweight'),
  ex('wall_sit', 'Wall Sit', 'جلوس على الحائط', 'quads', 'bodyweight', 'time'),
  ex('sled_push', 'Sled Push', 'دفع الزلاجة', 'quads', 'other', 'carry'),
  ex('adductor', 'Hip Adductor Machine', 'جهاز ضم الفخذ (الجزء الداخلي)', 'quads', 'machine'),
  // Legs: hamstrings
  ex('rdl', 'Romanian Deadlift', 'رفعة رومانية بالبار', 'hamstrings', 'barbell'),
  ex('db_rdl', 'Dumbbell Romanian Deadlift', 'رفعة رومانية بالدمبل', 'hamstrings', 'dumbbell'),
  ex('stiff_leg', 'Stiff-Leg Deadlift', 'رفعة ميتة بأرجل مفرودة', 'hamstrings', 'barbell'),
  ex('sumo_deadlift', 'Sumo Deadlift', 'رفعة ميتة سومو', 'hamstrings', 'barbell'),
  ex('good_morning', 'Barbell Good Morning', 'جود مورنينج بالبار', 'hamstrings', 'barbell'),
  ex('leg_curl', 'Lying Leg Curl', 'ثني الأرجل استلقاء (فخذ خلفي)', 'hamstrings', 'machine'),
  ex('seated_leg_curl', 'Seated Leg Curl', 'ثني الأرجل جالس (فخذ خلفي)', 'hamstrings', 'machine'),
  ex('nordic', 'Nordic Hamstring Curl', 'نوردك للفخذ الخلفي', 'hamstrings', 'bodyweight', 'bodyweight'),
  // Legs: glutes
  ex('hip_thrust', 'Barbell Hip Thrust', 'هيب ثرست بالبار', 'glutes', 'barbell'),
  ex('glute_bridge', 'Glute Bridge', 'جسر الأرداف', 'glutes', 'bodyweight', 'bodyweight'),
  ex('sumo_squat', 'Dumbbell Sumo Squat', 'سكوات سومو بالدمبل', 'glutes', 'dumbbell'),
  ex('pull_through', 'Cable Pull-Through', 'سحب الكيبل بين الأرجل', 'glutes', 'cable'),
  ex('glute_kick', 'Cable Glute Kickback', 'ركلة أرداف كيبل', 'glutes', 'cable'),
  ex('abductor', 'Hip Abductor Machine', 'جهاز تبعيد الفخذ', 'glutes', 'machine'),
  // Legs: calves
  ex('calf_raise', 'Standing Calf Raise', 'رفع السمانة واقف', 'calves', 'machine'),
  ex('seated_calf', 'Seated Calf Raise', 'رفع السمانة جالس', 'calves', 'machine'),
  ex('lp_calf', 'Leg Press Calf Raise', 'رفع السمانة على جهاز ضغط الأرجل', 'calves', 'machine'),
  ex('donkey_calf', 'Donkey Calf Raise', 'رفع السمانة (دونكي)', 'calves', 'machine'),
  ex('single_calf', 'Single-Leg Calf Raise', 'رفع السمانة برجل واحدة', 'calves', 'bodyweight', 'bodyweight'),
  // Core
  ex('plank', 'Plank', 'بلانك', 'core', 'bodyweight', 'time'),
  ex('crunch', 'Crunch', 'كرنش بطن', 'core', 'bodyweight', 'bodyweight'),
  ex('hanging_raise', 'Hanging Leg Raise', 'رفع الأرجل من التعلّق', 'core', 'bodyweight', 'bodyweight'),
  ex('cable_crunch', 'Cable Crunch', 'كرنش بطن كيبل', 'core', 'cable'),
  ex('russian_twist', 'Russian Twist', 'التفاف روسي', 'core', 'bodyweight', 'bodyweight'),
  ex('ab_wheel', 'Ab Wheel Rollout', 'عجلة البطن', 'core', 'bodyweight', 'bodyweight'),
  // Cardio: time + distance, no sets or reps
  ex('treadmill', 'Treadmill', 'السير الكهربائي', 'cardio', 'machine', 'cardio', { dist: 'km', extra: 'incline' }),
  ex('bike', 'Stationary Bike', 'الدراجة الثابتة', 'cardio', 'machine', 'cardio', { dist: 'km', extra: 'level' }),
  ex('elliptical', 'Elliptical Trainer', 'جهاز الإليبتكال', 'cardio', 'machine', 'cardio', { dist: 'km', extra: 'level' }),
  ex('rowing', 'Rowing Machine', 'جهاز التجديف الهوائي', 'cardio', 'machine', 'cardio', { dist: 'm', extra: 'level' }),
  ex('stairs', 'Stair Climber', 'جهاز صعود الدرج', 'cardio', 'machine', 'cardio', { dist: 'floors', extra: 'level' }),
  ex('run_out', 'Outdoor Run', 'جري في الخارج', 'cardio', 'bodyweight', 'cardio', { dist: 'km', extra: null }),
  ex('walk_out', 'Outdoor Walk', 'مشي في الخارج', 'cardio', 'bodyweight', 'cardio', { dist: 'km', extra: null }),
  ex('cycle_out', 'Outdoor Cycling', 'دراجة هوائية في الخارج', 'cardio', 'other', 'cardio', { dist: 'km', extra: null }),
  ex('swim', 'Swimming', 'سباحة', 'cardio', 'bodyweight', 'cardio', { dist: 'm', extra: null }),
  ex('jump_rope', 'Jump Rope', 'نط الحبل', 'cardio', 'bodyweight', 'time'),
  // Full body
  ex('kb_swing', 'Kettlebell Swing', 'أرجحة الكيتل بيل', 'full', 'kettlebell'),
  ex('clean', 'Power Clean', 'باور كلين', 'full', 'barbell'),
  ex('farmer', "Farmer's Walk", 'مشي المزارع', 'full', 'dumbbell', 'carry'),
  ex('burpee', 'Burpee', 'بيربي', 'full', 'bodyweight', 'bodyweight'),
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
