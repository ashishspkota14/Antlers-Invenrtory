export type Role = 'owner' | 'manager' | 'user';
export type Area = 'bar' | 'floor';

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

export type Item = {
  id: number;
  category_id: number;
  name: string;
  unit: string;
  have: number;
  need: number;
  sort_order: number;
  updated_at: string;
};

export type Category = {
  id: number;
  area: Area;
  name: string;
  sort_order: number;
  items: Item[];
};

export type WeeklyCount = {
  week_start: string;
  area: Area;
  finished_at: string;
  finisher: { name: string } | null;
};

export type WeeklyOrder = {
  id: number;
  item_name: string;
  unit: string;
  qty: number;
  ordered_at: string;
  orderer: { name: string } | null;
};

export const AREA_LABEL: Record<Area, string> = { bar: 'Bar', floor: 'Floor' };

/** Postgres numeric comes back as a string; normalise it. */
export const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, ''));

export const timeLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Denver',
  });
