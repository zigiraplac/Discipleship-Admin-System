/**
 * The fixed 80-lesson curriculum, seven classes, taught strictly in order.
 * Same for every cohort — reference data, not per-cohort data.
 * Titles copied verbatim from the ministry's own curriculum (02-domain-model.md).
 */

export interface CurriculumClass {
  n: number; // 1..7
  title: string;
  parts: string; // subtitle shown in the UI, e.g. "Intimacy 7 · Consecration 6"
  lessons: string[];
}

export const CURRICULUM: CurriculumClass[] = [
  {
    n: 1,
    title: "Foundational Teachings",
    parts: "16 lessons",
    lessons: [
      "Salvation Insurance",
      "Assurance of Forgiveness",
      "Repentance and Restitution",
      "The Word of God",
      "Prayer",
      "The Holy Spirit",
      "Christian Baptism",
      "Water and the Word",
      "The Lord’s Supper",
      "Fellowship of Believers",
      "Service in the Body",
      "Witnessing",
      "Overcoming Temptation",
      "Victory over the Flesh",
      "Obedience",
      "Growing in Grace",
    ],
  },
  {
    n: 2,
    title: "Deep Teachings",
    parts: "15 lessons",
    lessons: [
      "The Vision of God",
      "Stages of Growth",
      "Immersion Baptism",
      "Financial Commitment",
      "Tithe and Offering",
      "Covenant Relationship",
      "The Fear of the Lord",
      "Sanctification",
      "The Renewed Mind",
      "Faith and Confession",
      "Spiritual Authority",
      "The Armour of God",
      "Suffering and Endurance",
      "Stewardship of Time",
      "The Believer’s Hope",
    ],
  },
  {
    n: 3,
    title: "Intimacy & Consecration",
    parts: "Intimacy 7 · Consecration 6",
    lessons: [
      "Knowing the Spirit",
      "The Voice of the Spirit",
      "Communion",
      "Sensitivity to His Leading",
      "Grieving the Spirit",
      "Fruit of the Spirit",
      "Walking in the Spirit",
      "The Call to Consecration",
      "Separation unto God",
      "The Consecrated Body",
      "Fasting",
      "Guarding the Gates",
      "A Vessel Set Apart",
    ],
  },
  {
    n: 4,
    title: "Intercession & Listening",
    parts: "Warfare 11 · Listening 5",
    lessons: [
      "Reality of the Conflict",
      "The Kingdom of Darkness",
      "Authority in Christ",
      "Weapons of Warfare",
      "Binding and Loosing",
      "Strongholds of the Mind",
      "Deliverance",
      "Territorial Intercession",
      "Standing in the Gap",
      "Travail and Persistence",
      "Praying the Scriptures",
      "God Still Speaks",
      "Hearing His Voice",
      "Dreams and Visions",
      "Testing What We Hear",
      "Obeying What We Hear",
    ],
  },
  {
    n: 5,
    title: "Evangelism",
    parts: "8 lessons",
    lessons: [
      "Motivation",
      "The Message",
      "Methods",
      "Personal Preparation",
      "Handling Objections",
      "Street and House Outreach",
      "The Crusade Team",
      "Follow-up of Converts",
    ],
  },
  {
    n: 6,
    title: "Discipleship & Communication",
    parts: "5 lessons",
    lessons: [
      "The Call of God",
      "Making Disciples",
      "The Discipler’s Life",
      "Biblical Communication",
      "Delivering a Message",
    ],
  },
  {
    n: 7,
    title: "The Church Family",
    parts: "7 lessons",
    lessons: [
      "The Church in God’s Purpose",
      "Church Growth Models",
      "Community Development",
      "Spiritual Mapping",
      "Leadership and Eldership",
      "The Family in the Church",
      "Grand Finale",
    ],
  },
];

export const TOTAL_LESSONS = CURRICULUM.reduce((n, c) => n + c.lessons.length, 0); // 80

/** Every fourth lesson (global index) carries a quiz: 3, 7, 11, ... 79. */
export function isQuizLesson(globalIndex: number): boolean {
  return globalIndex % 4 === 3;
}

export interface LessonLocator {
  classIndex: number; // 0-based
  classNumber: number; // 1-based
  indexInClass: number; // 0-based
  ref: string; // "C3 · L7"
  title: string;
  className: string;
  globalIndex: number;
}

let _flat: LessonLocator[] | null = null;

/** Flat lookup by global index (0..79). Built once, reused everywhere. */
export function lessonAt(globalIndex: number): LessonLocator {
  if (!_flat) {
    const flat: LessonLocator[] = [];
    CURRICULUM.forEach((cls, ci) => {
      cls.lessons.forEach((title, li) => {
        flat.push({
          classIndex: ci,
          classNumber: cls.n,
          indexInClass: li,
          ref: `C${cls.n} · L${li + 1}`,
          title,
          className: cls.title,
          globalIndex: flat.length,
        });
      });
    });
    _flat = flat;
  }
  return (
    _flat[globalIndex] ?? {
      classIndex: 6,
      classNumber: 7,
      indexInClass: 0,
      ref: "—",
      title: "—",
      className: "—",
      globalIndex,
    }
  );
}

/** [firstGlobalIndex, lastGlobalIndex] for each class, 0-based classIndex. */
export function classSpans(): [number, number][] {
  const spans: [number, number][] = [];
  let acc = 0;
  for (const cls of CURRICULUM) {
    spans.push([acc, acc + cls.lessons.length - 1]);
    acc += cls.lessons.length;
  }
  return spans;
}
