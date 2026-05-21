export interface ValuesCharacter {
  id: string;
  name: string;
  source: string;
  /** Used for AI inference only — not shown on swipe cards. */
  values: string[];
  videoUrl: string;
  /** Theme-style audio for the character's show; swap for licensed clips in production. */
  themeAudioUrl: string;
}

// Royalty-free stand-ins (Mixkit). Replace with licensed show themes in production.
const VIDEOS = [
  "https://assets.mixkit.co/videos/preview/mixkit-waves-coming-to-the-beach-5016-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-tree-with-yellow-flowers-1173-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-a-beach-with-waves-747-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-young-woman-walking-on-the-beach-538-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-palm-tree-in-the-wind-1240-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-sunset-over-the-sea-1199-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-woman-running-on-the-beach-537-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-clouds-and-blue-sky-2408-large.mp4",
] as const;

const THEMES = [
  "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-dreaming-big-31.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-spirit-of-the-season-443.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-driving-ambition-32.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-silent-descent-amb-209.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-relaxing-in-nature-522.mp3",
  "https://assets.mixkit.co/music/preview/mixkit-a-very-happy-christmas-897.mp3",
] as const;

function media(index: number): Pick<ValuesCharacter, "videoUrl" | "themeAudioUrl"> {
  return {
    videoUrl: VIDEOS[index % VIDEOS.length]!,
    themeAudioUrl: THEMES[index % THEMES.length]!,
  };
}

export const VALUES_CHARACTERS: ValuesCharacter[] = [
  {
    id: "james-bond",
    name: "James Bond",
    source: "007",
    values: ["Independence", "Competence", "Loyalty", "Composure"],
    ...media(0),
  },
  {
    id: "kim-kardashian",
    name: "Kim Kardashian",
    source: "Keeping Up with the Kardashians",
    values: ["Ambition", "Family", "Self-expression", "Resilience"],
    ...media(1),
  },
  {
    id: "groot",
    name: "Groot",
    source: "Guardians of the Galaxy",
    values: ["Loyalty", "Protection", "Simplicity", "Belonging"],
    ...media(2),
  },
  {
    id: "hermione-granger",
    name: "Hermione Granger",
    source: "Harry Potter",
    values: ["Justice", "Learning", "Integrity", "Courage"],
    ...media(3),
  },
  {
    id: "tony-stark",
    name: "Tony Stark",
    source: "Marvel Cinematic Universe",
    values: ["Innovation", "Responsibility", "Confidence", "Legacy"],
    ...media(4),
  },
  {
    id: "leslie-knope",
    name: "Leslie Knope",
    source: "Parks and Recreation",
    values: ["Service", "Optimism", "Friendship", "Dedication"],
    ...media(5),
  },
  {
    id: "walter-white",
    name: "Walter White",
    source: "Breaking Bad",
    values: ["Security", "Recognition", "Control", "Family"],
    ...media(6),
  },
  {
    id: "moana",
    name: "Moana",
    source: "Moana",
    values: ["Exploration", "Courage", "Heritage", "Purpose"],
    ...media(7),
  },
  {
    id: "batman",
    name: "Batman",
    source: "DC Comics",
    values: ["Justice", "Discipline", "Sacrifice", "Protection"],
    ...media(0),
  },
  {
    id: "oprah-winfrey",
    name: "Oprah Winfrey",
    source: "The Oprah Winfrey Show",
    values: ["Empathy", "Growth", "Authenticity", "Generosity"],
    ...media(1),
  },
  {
    id: "elle-woods",
    name: "Elle Woods",
    source: "Legally Blonde",
    values: ["Determination", "Kindness", "Self-respect", "Excellence"],
    ...media(2),
  },
  {
    id: "michael-scott",
    name: "Michael Scott",
    source: "The Office",
    values: ["Belonging", "Humor", "Loyalty", "Recognition"],
    ...media(3),
  },
  {
    id: "katniss-everdeen",
    name: "Katniss Everdeen",
    source: "The Hunger Games",
    values: ["Survival", "Protection", "Sacrifice", "Autonomy"],
    ...media(4),
  },
  {
    id: "mr-rogers",
    name: "Fred Rogers",
    source: "Mister Rogers' Neighborhood",
    values: ["Kindness", "Patience", "Acceptance", "Neighbourliness"],
    ...media(5),
  },
  {
    id: "wednesday-addams",
    name: "Wednesday Addams",
    source: "Wednesday",
    values: ["Authenticity", "Independence", "Loyalty", "Truth"],
    ...media(6),
  },
  {
    id: "luke-skywalker",
    name: "Luke Skywalker",
    source: "Star Wars",
    values: ["Hope", "Faith", "Redemption", "Courage"],
    ...media(7),
  },
  {
    id: "miranda-priestly",
    name: "Miranda Priestly",
    source: "The Devil Wears Prada",
    values: ["Excellence", "Standards", "Ambition", "Discipline"],
    ...media(0),
  },
  {
    id: "t-800",
    name: "T-800",
    source: "Terminator 2",
    values: ["Protection", "Duty", "Learning", "Sacrifice"],
    ...media(1),
  },
  {
    id: "dory",
    name: "Dory",
    source: "Finding Nemo",
    values: ["Optimism", "Friendship", "Persistence", "Trust"],
    ...media(2),
  },
  {
    id: "black-panther",
    name: "T'Challa",
    source: "Black Panther",
    values: ["Duty", "Heritage", "Justice", "Leadership"],
    ...media(3),
  },
  {
    id: "fleabag",
    name: "Fleabag",
    source: "Fleabag",
    values: ["Honesty", "Growth", "Connection", "Humour"],
    ...media(4),
  },
  {
    id: "ted-lasso",
    name: "Ted Lasso",
    source: "Ted Lasso",
    values: ["Kindness", "Curiosity", "Belief", "Teamwork"],
    ...media(5),
  },
  {
    id: "eleven",
    name: "Eleven",
    source: "Stranger Things",
    values: ["Belonging", "Courage", "Loyalty", "Protection"],
    ...media(6),
  },
  {
    id: "michael-corleone",
    name: "Michael Corleone",
    source: "The Godfather",
    values: ["Family", "Loyalty", "Power", "Legacy"],
    ...media(7),
  },
];

const characterById = new Map(
  VALUES_CHARACTERS.map((character) => [character.id, character]),
);

export function getValuesCharacter(id: string): ValuesCharacter | undefined {
  return characterById.get(id);
}
