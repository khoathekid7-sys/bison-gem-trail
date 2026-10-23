export type MapStop = {
  id: string;
  lat: number;
  lng: number;
  radius: number;
  label: string;
  gemImg: string;
  state: "active" | "locked" | "done";
};
