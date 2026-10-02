/* Serva's customers as shown on the marketing pages — read off prod, with the two
   demo accounts (Mutrah Coffee, Qurum Juice) left out. The logos are static copies in
   public/customers/, pulled from each café's own upload: a new café, or a new logo,
   has to be added here by hand. Hub & co has not uploaded one yet, so it has none. */
export const CUSTOMERS = [
  { key: 'bunista', name: { en: 'Bunista', ar: 'بونيستا' }, kind: { en: 'Coffee & breakfast', ar: 'قهوة وفطور' }, logo: '/customers/bunista.webp' },
  { key: 'hub-co', name: { en: 'Hub & co', ar: 'Hub & co' }, kind: { en: 'Specialty coffee', ar: 'قهوة مختصة' } },
  { key: 'la-pizza', name: { en: 'La Pizza', ar: 'لا بيتزا' }, kind: { en: 'Pizzeria', ar: 'مطعم بيتزا' }, logo: '/customers/la-pizza.webp' },
  { key: 'e44', name: { en: 'E44', ar: 'E44' }, kind: { en: 'Coffee bar', ar: 'مقهى' }, logo: '/customers/e44.webp' },
  { key: 'thai-ice', name: { en: 'Thai Ice', ar: 'تاي ايس' }, kind: { en: 'Desserts', ar: 'حلويات' }, logo: '/customers/thai-ice.webp' },
];
