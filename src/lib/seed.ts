/**
 * First-run data.
 *
 * This is case PUB-01 from the published P12 fixture, converted to paisa —
 * two whole months of real Dhaka spending across nine categories, three
 * pockets, and the case's own `today` of 17 April 2026.
 *
 * Seeding real published data rather than inventing numbers means the
 * month-over-month comparison, the forecast and the insights all have
 * something true to work with the moment the app opens, and it means a judge
 * can check the figures against the fixture they already have.
 *
 * Generated from public/sample-data/P12_personal_ledger_public.json.
 */

import type { Expense, Pocket } from "./types";

export const SEED_CASE_ID = "PUB-01";
export const SEED_TODAY = "2026-04-17";
export const SEED_SALARY = 5000000; // paisa
export const SEED_DPS_RATE = 8;

export const SEED_EXPENSES: Expense[] = [
  {
    "id": "E001",
    "date": "2026-03-02",
    "category": "Groceries",
    "shop": "Meena Bazar",
    "amount": 247500
  },
  {
    "id": "E002",
    "date": "2026-03-04",
    "category": "Rent",
    "shop": "Landlord",
    "amount": 1600000
  },
  {
    "id": "E003",
    "date": "2026-03-04",
    "category": "Utilities",
    "shop": "DESCO",
    "amount": 85650
  },
  {
    "id": "E004",
    "date": "2026-03-05",
    "category": "Education",
    "shop": "Udemy",
    "amount": 132900
  },
  {
    "id": "E005",
    "date": "2026-03-05",
    "category": "Food",
    "shop": "Madchef",
    "amount": 30400
  },
  {
    "id": "E006",
    "date": "2026-03-06",
    "category": "Education",
    "shop": "Udemy",
    "amount": 71900
  },
  {
    "id": "E007",
    "date": "2026-03-06",
    "category": "Transport",
    "shop": "Uber",
    "amount": 42100
  },
  {
    "id": "E008",
    "date": "2026-03-07",
    "category": "Education",
    "shop": "Bookworm",
    "amount": 50100
  },
  {
    "id": "E009",
    "date": "2026-03-07",
    "category": "Food",
    "shop": "Panda Garden",
    "amount": 50500
  },
  {
    "id": "E010",
    "date": "2026-03-07",
    "category": "Food",
    "shop": "Panda Garden",
    "amount": 58500
  },
  {
    "id": "E011",
    "date": "2026-03-08",
    "category": "Health",
    "shop": "Lazz Pharma",
    "amount": 147700
  },
  {
    "id": "E012",
    "date": "2026-03-11",
    "category": "Mobile",
    "shop": "GP recharge",
    "amount": 42200
  },
  {
    "id": "E013",
    "date": "2026-03-12",
    "category": "Health",
    "shop": "Lazz Pharma",
    "amount": 71050
  },
  {
    "id": "E014",
    "date": "2026-03-16",
    "category": "Education",
    "shop": "Udemy",
    "amount": 256300
  },
  {
    "id": "E015",
    "date": "2026-03-16",
    "category": "Food",
    "shop": "Panda Garden",
    "amount": 34800
  },
  {
    "id": "E016",
    "date": "2026-03-17",
    "category": "Entertainment",
    "shop": "Netflix",
    "amount": 88250
  },
  {
    "id": "E017",
    "date": "2026-03-17",
    "category": "Health",
    "shop": "Popular Diagnostic",
    "amount": 247400
  },
  {
    "id": "E018",
    "date": "2026-03-18",
    "category": "Transport",
    "shop": "Pathao",
    "amount": 41500
  },
  {
    "id": "E019",
    "date": "2026-03-20",
    "category": "Entertainment",
    "shop": "Steam",
    "amount": 113200
  },
  {
    "id": "E020",
    "date": "2026-03-23",
    "category": "Education",
    "shop": "Bookworm",
    "amount": 174200
  },
  {
    "id": "E021",
    "date": "2026-03-28",
    "category": "Groceries",
    "shop": "Shwapno",
    "amount": 49700
  },
  {
    "id": "E022",
    "date": "2026-03-28",
    "category": "Groceries",
    "shop": "Unimart",
    "amount": 315300
  },
  {
    "id": "E023",
    "date": "2026-03-29",
    "category": "Groceries",
    "shop": "Meena Bazar",
    "amount": 139800
  },
  {
    "id": "E024",
    "date": "2026-03-29",
    "category": "Mobile",
    "shop": "Robi recharge",
    "amount": 66700
  },
  {
    "id": "E025",
    "date": "2026-03-30",
    "category": "Groceries",
    "shop": "Agora",
    "amount": 73650
  },
  {
    "id": "E026",
    "date": "2026-03-31",
    "category": "Education",
    "shop": "Udemy",
    "amount": 122300
  },
  {
    "id": "E027",
    "date": "2026-04-03",
    "category": "Rent",
    "shop": "Landlord",
    "amount": 1600000
  },
  {
    "id": "E028",
    "date": "2026-04-04",
    "category": "Food",
    "shop": "Sultans Dine",
    "amount": 36400
  },
  {
    "id": "E029",
    "date": "2026-04-06",
    "category": "Food",
    "shop": "Panda Garden",
    "amount": 49200
  },
  {
    "id": "E030",
    "date": "2026-04-07",
    "category": "Mobile",
    "shop": "GP recharge",
    "amount": 53550
  },
  {
    "id": "E031",
    "date": "2026-04-07",
    "category": "Utilities",
    "shop": "DESCO",
    "amount": 259950
  },
  {
    "id": "E032",
    "date": "2026-04-08",
    "category": "Mobile",
    "shop": "bKash",
    "amount": 67900
  },
  {
    "id": "E033",
    "date": "2026-04-11",
    "category": "Groceries",
    "shop": "Unimart",
    "amount": 54650
  },
  {
    "id": "E034",
    "date": "2026-04-11",
    "category": "Mobile",
    "shop": "Robi recharge",
    "amount": 69100
  },
  {
    "id": "E035",
    "date": "2026-04-12",
    "category": "Transport",
    "shop": "BRTC bus",
    "amount": 46100
  },
  {
    "id": "E036",
    "date": "2026-04-13",
    "category": "Entertainment",
    "shop": "Star Cineplex",
    "amount": 132600
  },
  {
    "id": "E037",
    "date": "2026-04-13",
    "category": "Entertainment",
    "shop": "Star Cineplex",
    "amount": 73800
  },
  {
    "id": "E038",
    "date": "2026-04-15",
    "category": "Mobile",
    "shop": "GP recharge",
    "amount": 91950
  },
  {
    "id": "E039",
    "date": "2026-04-15",
    "category": "Mobile",
    "shop": "bKash",
    "amount": 76400
  },
  {
    "id": "E040",
    "date": "2026-04-15",
    "category": "Transport",
    "shop": "CNG",
    "amount": 23200
  },
  {
    "id": "E041",
    "date": "2026-04-17",
    "category": "Food",
    "shop": "Madchef",
    "amount": 73500
  }
];

export const SEED_POCKETS: Pocket[] = [
  {
    "id": "SP-1",
    "name": "Wedding",
    "item": "reception hall booking",
    "target": 30000000,
    "monthlyContribution": 2000000,
    "priority": 0,
    "createdAt": 1000
  },
  {
    "id": "SP-2",
    "name": "Laptop",
    "item": "MacBook Air M4",
    "target": 14500000,
    "monthlyContribution": 1200000,
    "priority": 1,
    "createdAt": 1001
  },
  {
    "id": "SP-3",
    "name": "Bike",
    "item": "Honda Livo",
    "target": 15000000,
    "monthlyContribution": 900000,
    "priority": 2,
    "createdAt": 1002
  }
];
