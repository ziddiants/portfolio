// The component fixture page (ENG-12). Components that no real page uses yet (Button, Link,
// ExternalLink, Figure, MarginNote) are tested here. The page is written into a temp copy of
// the repo and built there; it never reaches dist/ or git.
export const SAMPLE_BYTES = 118_400; // shown as "118 KB"
export const SAMPLE_LABEL = 'Résumé · PDF, 118 KB';

export const FIXTURE_PAGE = `---
import { statSync } from 'node:fs';
import BaseLayout from '../layouts/BaseLayout.astro';
import SectionHeader from '../components/SectionHeader.astro';
import Button from '../components/Button.astro';
import Link from '../components/Link.astro';
import ExternalLink from '../components/ExternalLink.astro';
import Figure from '../components/Figure.astro';
import MarginNote from '../components/MarginNote.astro';
import shot from '../assets/gpay/gpay-processing.png';
import { downloadLabel } from '../lib/format-size';

const bytes = statSync('.build/public-payments/sample.pdf').size;
---
<BaseLayout title="Fixture">
  <h1>Fixture</h1>
  <section id="fx" class="home-section" aria-labelledby="fx-heading">
    <SectionHeader number="01" name="Selected work" heading="A heading" headingId="fx-heading" intro="An intro line." />
    <p id="p1">First paragraph.</p>
    <p id="p2">Second paragraph.</p>
    <MarginNote kind="fact" source="S-014">A note under the paragraph.</MarginNote>
    <p id="after">
      <span id="num" class="num">45% → 63%</span>
      <time id="time" datetime="2024-09-01">Sep 2024</time>
    </p>
    <p>
      <Link id="inline" href="/fixture" data-kind="inline">Inline link</Link>
      <Link href="/fixture" variant="arrow">Arrow link</Link>
      <ExternalLink href="https://example.org/x">Outside link</ExternalLink>
      <ExternalLink id="ext2" href="https://example.org/y" data-kind="ext">Second outside link</ExternalLink>
      <a id="plain-outside" href="https://example.org/plain">Plain outside link</a>
    </p>
    <p>
      <Button href="/sample.pdf" download>{downloadLabel('Résumé', 'PDF', bytes)}</Button>
      <Button href="/fixture" variant="secondary">Secondary</Button>
      <Button href="/fixture" fullWidth class="wide">Full width</Button>
    </p>
    <Figure src={shot} alt="A payment status screen." caption="Look at the status line." widths={[360, 590]} sizes="(min-width: 768px) 590px, 100vw" />
  </section>
</BaseLayout>
`;
