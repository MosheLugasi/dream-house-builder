/** Named moments of the day (the HUD buttons and the N key jump between them). */
// (the sun sets at 18:00 in Atmosphere's model: 17:42 is the golden hour, 18:36 was already full night)
// (its own module: the HUD needs it before the 3D engine – a separate chunk loaded on demand – is there)
export const DAY_MOMENTS = { day: 14.5, sunset: 17.7, night: 21.5 } as const;
export type TimeOfDay = keyof typeof DAY_MOMENTS;
export function momentOf(hours: number): TimeOfDay {
  return hours >= 20 || hours < 5.5 ? 'night' : hours >= 17.5 ? 'sunset' : 'day';
}
