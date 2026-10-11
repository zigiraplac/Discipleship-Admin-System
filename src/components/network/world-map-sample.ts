/** SAMPLE DATA for the world map — to show the experience only. Replace
 * with real per-country figures (from the organisation's countries) when
 * the map goes live. Country names match the map's own spelling. */
export interface CountryPresence {
  country: string;
  students: number;
  churches: number;
  cohorts: number;
}

export const SAMPLE_PRESENCE: CountryPresence[] = [
  { country: "Rwanda", students: 4820, churches: 14, cohorts: 62 },
  { country: "Uganda", students: 2310, churches: 8, cohorts: 31 },
  { country: "Kenya", students: 1980, churches: 7, cohorts: 26 },
  { country: "Burundi", students: 1240, churches: 5, cohorts: 17 },
  { country: "Dem. Rep. Congo", students: 2890, churches: 9, cohorts: 38 },
  { country: "Tanzania", students: 960, churches: 4, cohorts: 12 },
  { country: "South Africa", students: 720, churches: 3, cohorts: 9 },
  { country: "Nigeria", students: 1460, churches: 6, cohorts: 19 },
  { country: "Cameroon", students: 380, churches: 2, cohorts: 5 },
  { country: "Côte d'Ivoire", students: 290, churches: 1, cohorts: 4 },
  { country: "Belgium", students: 640, churches: 3, cohorts: 8 },
  { country: "France", students: 870, churches: 4, cohorts: 11 },
  { country: "United Kingdom", students: 540, churches: 2, cohorts: 7 },
  { country: "Germany", students: 310, churches: 1, cohorts: 4 },
  { country: "United States of America", students: 2150, churches: 9, cohorts: 28 },
  { country: "Canada", students: 820, churches: 4, cohorts: 10 },
  { country: "Brazil", students: 430, churches: 2, cohorts: 6 },
  { country: "India", students: 260, churches: 1, cohorts: 3 },
  { country: "Australia", students: 190, churches: 1, cohorts: 2 },
];
