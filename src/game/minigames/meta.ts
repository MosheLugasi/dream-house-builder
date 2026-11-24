/**
 * The neighborhood's mini-games: ids and how they are presented. Dependency-free on purpose (the
 * catalog's start signs and the UI both read it).
 */
export type MiniGameId =
  | 'race'
  | 'delivery'
  | 'skatepark'
  | 'parkour'
  | 'amusement'
  | 'football'
  | 'fishing'
  | 'dance'
  | 'treasure'
  | 'farm';

export interface MiniGameMeta {
  id: MiniGameId;
  /** Hebrew name */
  name: string;
  icon: string;
  /** one line that makes you want to play */
  tagline: string;
  /** main colour of its sign / HUD accent */
  color: string;
}

export const MINI_GAME_META: MiniGameMeta[] = [
  { id: 'race', name: 'מירוץ בשכונה', icon: '🏁', tagline: 'מכוניות, אופניים או קורקינט – 3 הקפות נגד יריבים', color: '#e0402f' },
  { id: 'delivery', name: 'שליח פיצה', icon: '🍕', tagline: 'לאסוף פיצות חמות ולהביא אותן בזמן לכל הבתים', color: '#f08a24' },
  { id: 'skatepark', name: 'פארק אתגרי', icon: '🛹', tagline: 'רמפות, מעקות וקפיצות – פעלולים ונקודות', color: '#2f7fd0' },
  { id: 'parkour', name: 'מסלול מכשולים', icon: '🧗', tagline: 'לקפוץ, לטפס ולהתאזן – כמה מהר אפשר?', color: '#3aa35b' },
  { id: 'amusement', name: 'לונה פארק', icon: '🎡', tagline: 'גלגל ענק, רכבת הרים ומגדל נפילה – לבנות ולעלות', color: '#c23bb0' },
  { id: 'football', name: 'בעיטות עונשין', icon: '⚽', tagline: 'לכוון, לבחור עוצמה ולהבקיע מול השוער', color: '#1f9d6a' },
  { id: 'fishing', name: 'דייג באגם', icon: '🎣', tagline: 'להטיל חכה, לחכות לנשיכה ולמשוך בזהירות', color: '#2a8fb5' },
  { id: 'dance', name: 'מופע ריקוד', icon: '💃', tagline: 'ללחוץ על החיצים בקצב המוזיקה על הבמה', color: '#8a46d8' },
  { id: 'treasure', name: 'ציד אוצרות', icon: '🗺️', tagline: 'חידות, רמזים ותיבות אוצר בכל השכונה', color: '#b8862d' },
  { id: 'farm', name: 'החווה שלי', icon: '🥕', tagline: 'לשתול, להשקות, לקטוף ולמכור בדוכן', color: '#6c9a2c' },
];

export const miniGameMeta = (id: MiniGameId): MiniGameMeta => MINI_GAME_META.find((m) => m.id === id)!;
