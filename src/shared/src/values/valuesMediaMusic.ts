/** Licensed background tracks (SoundHelix — CC BY 4.0, https://www.soundhelix.com/license.php). */
export type ValuesMediaMood =
  | "warm"
  | "epic"
  | "tense"
  | "playful"
  | "ambient"
  | "triumphant"
  | "mysterious";

export interface LicensedMusicTrack {
  id: string;
  url: string;
  license: "SoundHelix CC BY 4.0";
  moods: ValuesMediaMood[];
}

export const LICENSED_MUSIC_TRACKS: LicensedMusicTrack[] = [
  {
    id: "soundhelix-1",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    license: "SoundHelix CC BY 4.0",
    moods: ["warm", "triumphant", "playful"],
  },
  {
    id: "soundhelix-2",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    license: "SoundHelix CC BY 4.0",
    moods: ["ambient", "warm"],
  },
  {
    id: "soundhelix-3",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    license: "SoundHelix CC BY 4.0",
    moods: ["ambient", "warm"],
  },
  {
    id: "soundhelix-4",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    license: "SoundHelix CC BY 4.0",
    moods: ["epic", "triumphant"],
  },
  {
    id: "soundhelix-5",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
    license: "SoundHelix CC BY 4.0",
    moods: ["epic", "tense", "playful"],
  },
  {
    id: "soundhelix-6",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
    license: "SoundHelix CC BY 4.0",
    moods: ["mysterious", "tense", "ambient"],
  },
  {
    id: "soundhelix-7",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
    license: "SoundHelix CC BY 4.0",
    moods: ["warm", "playful"],
  },
  {
    id: "soundhelix-8",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    license: "SoundHelix CC BY 4.0",
    moods: ["playful", "warm"],
  },
];
