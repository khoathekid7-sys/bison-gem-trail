import { createFileRoute } from "@tanstack/react-router";
import { Game } from "@/components/game/Game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bison Quest — Bucknell photo scavenger hunt" },
      { name: "description", content: "Solve clues, walk Bucknell's campus, photograph two hidden gems and build your own photo album." },
      { property: "og:title", content: "Bison Quest — Bucknell photo scavenger hunt" },
      { property: "og:description", content: "Two hidden gems. One campus. Your story." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});
