export interface ValuesCharacter {
  id: string;
  name: string;
  source: string;
  values: string[];
}

export const VALUES_CHARACTERS: ValuesCharacter[] = [
  {
    id: "james-bond",
    name: "James Bond",
    source: "007",
    values: ["Independence", "Competence", "Loyalty", "Composure"],
  },
  {
    id: "kim-kardashian",
    name: "Kim Kardashian",
    source: "Keeping Up with the Kardashians",
    values: ["Ambition", "Family", "Self-expression", "Resilience"],
  },
  {
    id: "groot",
    name: "Groot",
    source: "Guardians of the Galaxy",
    values: ["Loyalty", "Protection", "Simplicity", "Belonging"],
  },
  {
    id: "hermione-granger",
    name: "Hermione Granger",
    source: "Harry Potter",
    values: ["Justice", "Learning", "Integrity", "Courage"],
  },
  {
    id: "tony-stark",
    name: "Tony Stark",
    source: "Marvel Cinematic Universe",
    values: ["Innovation", "Responsibility", "Confidence", "Legacy"],
  },
  {
    id: "leslie-knope",
    name: "Leslie Knope",
    source: "Parks and Recreation",
    values: ["Service", "Optimism", "Friendship", "Dedication"],
  },
  {
    id: "walter-white",
    name: "Walter White",
    source: "Breaking Bad",
    values: ["Security", "Recognition", "Control", "Family"],
  },
  {
    id: "moana",
    name: "Moana",
    source: "Moana",
    values: ["Exploration", "Courage", "Heritage", "Purpose"],
  },
  {
    id: "batman",
    name: "Batman",
    source: "DC Comics",
    values: ["Justice", "Discipline", "Sacrifice", "Protection"],
  },
  {
    id: "oprah-winfrey",
    name: "Oprah Winfrey",
    source: "The Oprah Winfrey Show",
    values: ["Empathy", "Growth", "Authenticity", "Generosity"],
  },
  {
    id: "elle-woods",
    name: "Elle Woods",
    source: "Legally Blonde",
    values: ["Determination", "Kindness", "Self-respect", "Excellence"],
  },
  {
    id: "michael-scott",
    name: "Michael Scott",
    source: "The Office",
    values: ["Belonging", "Humor", "Loyalty", "Recognition"],
  },
  {
    id: "katniss-everdeen",
    name: "Katniss Everdeen",
    source: "The Hunger Games",
    values: ["Survival", "Protection", "Sacrifice", "Autonomy"],
  },
  {
    id: "mr-rogers",
    name: "Fred Rogers",
    source: "Mister Rogers' Neighborhood",
    values: ["Kindness", "Patience", "Acceptance", "Neighbourliness"],
  },
  {
    id: "wednesday-addams",
    name: "Wednesday Addams",
    source: "Wednesday",
    values: ["Authenticity", "Independence", "Loyalty", "Truth"],
  },
  {
    id: "luke-skywalker",
    name: "Luke Skywalker",
    source: "Star Wars",
    values: ["Hope", "Faith", "Redemption", "Courage"],
  },
  {
    id: "miranda-priestly",
    name: "Miranda Priestly",
    source: "The Devil Wears Prada",
    values: ["Excellence", "Standards", "Ambition", "Discipline"],
  },
  {
    id: "t-800",
    name: "T-800",
    source: "Terminator 2",
    values: ["Protection", "Duty", "Learning", "Sacrifice"],
  },
  {
    id: "dory",
    name: "Dory",
    source: "Finding Nemo",
    values: ["Optimism", "Friendship", "Persistence", "Trust"],
  },
  {
    id: "black-panther",
    name: "T'Challa",
    source: "Black Panther",
    values: ["Duty", "Heritage", "Justice", "Leadership"],
  },
  {
    id: "fleabag",
    name: "Fleabag",
    source: "Fleabag",
    values: ["Honesty", "Growth", "Connection", "Humour"],
  },
  {
    id: "ted-lasso",
    name: "Ted Lasso",
    source: "Ted Lasso",
    values: ["Kindness", "Curiosity", "Belief", "Teamwork"],
  },
  {
    id: "eleven",
    name: "Eleven",
    source: "Stranger Things",
    values: ["Belonging", "Courage", "Loyalty", "Protection"],
  },
  {
    id: "michael-corleone",
    name: "Michael Corleone",
    source: "The Godfather",
    values: ["Family", "Loyalty", "Power", "Legacy"],
  },
];

const characterById = new Map(
  VALUES_CHARACTERS.map((character) => [character.id, character]),
);

export function getValuesCharacter(id: string): ValuesCharacter | undefined {
  return characterById.get(id);
}
