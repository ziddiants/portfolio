// Pending checks (D80). Each entry is a check whose content a later ticket builds, with that
// ticket. Its findings are printed as "pending" and do not fail the build. When the check finds
// nothing, the run fails until the entry is removed, so this list can only shrink.
// Production release and /ship-check refuse while it is not empty (ENG-30).
// Every entry needs Aditya's approval (D80); remove entries, never add them to pass a build.
export const PENDING = {
  'VF-11/description': 'ENG-22',
  'VF-11/canonical': 'ENG-22',
  'VF-11/open-graph': 'ENG-22',
  'VF-12/noindex-meta': 'ENG-22',
  'VF-12/robots-open': 'ENG-22', // the ENG-04 stub blocks every crawler on purpose
  'VF-12/noindex-header': 'ENG-23',
  'VF-14/cohort-intro': 'ENG-15',
  'VF-14/tags': 'ENG-15',
  'VF-14/card-lines': 'ENG-15',
  'VF-14/c1-order': 'ENG-18',
  'VF-14/disclaimer': 'ENG-20',
};
