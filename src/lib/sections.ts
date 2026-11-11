// The seven home sections after the hero, in H1 order (PRD H1). One list feeds the page frame,
// and ENG-13's navigation. Labels, nav names and anchors: design-brand.md § Interface copy.
// The h2 lines are fixed copy (D99).
export const SECTIONS = [
  {
    id: 'work',
    number: '01',
    name: 'Selected work',
    nav: 'Work',
    heading: 'When payments fail, people stop trusting',
  },
  {
    id: 'projects',
    number: '02',
    name: 'Product case studies',
    nav: 'Projects',
    heading: 'Three problems, one week each',
  },
  {
    id: 'principles',
    number: '03',
    name: 'How I think about products',
    nav: 'How I think',
    heading: 'Rules I learned the hard way',
  },
  {
    id: 'about',
    number: '04',
    name: 'About',
    nav: 'About',
    heading: 'The short version of my story',
  },
  {
    id: 'experience',
    number: '05',
    name: 'Experience',
    nav: 'Experience',
    heading: 'Every role, straight from my résumé',
  },
  {
    id: 'toolkit',
    number: '06',
    name: 'Toolkit',
    nav: 'Toolkit',
    heading: 'What I actually build with',
  },
  {
    id: 'contact',
    number: '07',
    name: 'Contact',
    nav: 'Contact',
    heading: 'The rest is better in conversation',
  },
] as const;

// The two nav items a detail page can mark as its own (DS-CMP-01): case studies are Work, projects are Projects.
export type NavCurrent = 'work' | 'projects';
