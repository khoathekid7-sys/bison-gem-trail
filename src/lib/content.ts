import gemAmber from "@/assets/gem-amber.png";
import gemSapphire from "@/assets/gem-sapphire.png";

export type StopContent = {
  id: "elc" | "carnegie";
  step: number;
  gemName: string;
  place: string;
  gemColor: "amber" | "sapphire";
  gemImg: string;
  xp: number;
  clue: string;
  hints: string[];
  photoGoal: string;
  challenge?: string;
  discovery: { title: string; body: string; source: string; sourceLabel: string };
  official: { lat: number; lng: number };
};

export const STOPS: StopContent[] = [
  {
    id: "elc",
    step: 1,
    gemName: "The Common Ground",
    place: "ELC uphill patio",
    gemColor: "amber",
    gemImg: gemAmber,
    xp: 100,
    clue:
      "Where campus paths and conversations meet, find the open-air room with a seat. At Langone’s uphill door, pause outside — your first small treasure is where friends collide.",
    hints: [
      "Think student life, outside.",
      "Look for the uphill entrance of the Elaine Langone Center.",
      "Photograph the outdoor patio seating with part of the ELC entrance visible.",
    ],
    photoGoal: "Outdoor patio seating or paving, with part of the ELC entrance or façade in frame.",
    discovery: {
      title: "A room without walls",
      body: "The Class of 2026 supported this new outdoor gathering space at the ELC’s uphill entrance — seating made for exactly the kind of run-ins you just had.",
      source: "https://www.bucknell.edu/news/class-2026-leaves-its-mark-new-elc-patio-gathering-space",
      sourceLabel: "Bucknell News",
    },
    official: { lat: 40.956486, lng: -76.884524 },
  },
  {
    id: "carnegie",
    step: 2,
    gemName: "The Library That Changed",
    place: "Carnegie Building",
    gemColor: "sapphire",
    gemImg: gemSapphire,
    xp: 150,
    clue:
      "Before Bertrand held the stories, another keeper wore the crown. Find Carnegie’s old book home, and frame a detail others hurry past.",
    hints: [
      "Look for a former campus library.",
      "Find the Carnegie Building.",
      "Capture its entrance or distinctive façade, wide enough to recognize the building.",
    ],
    photoGoal: "Carnegie’s entrance or façade, wide enough to recognize the building.",
    challenge: "Bonus eye: notice a carved or architectural detail most people walk past.",
    discovery: {
      title: "The first keeper of stories",
      body: "Carnegie opened in 1905 as Bucknell’s dedicated library — the campus’s book home long before Bertrand.",
      source: "https://www.departments.bucknell.edu/history/carnegie/index.html",
      sourceLabel: "Bucknell history",
    },
    official: { lat: 40.95618, lng: -76.88178 },
  },
];

export const TOTAL_XP = STOPS.reduce((s, x) => s + x.xp, 0);
export const stopByStep = (step: number) => STOPS.find((s) => s.step === step);
export const stopById = (id: string) => STOPS.find((s) => s.id === id);
