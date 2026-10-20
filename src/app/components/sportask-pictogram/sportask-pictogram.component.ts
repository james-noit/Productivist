import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PICTOGRAMS } from '../../../lib/sportask/pictogram-paths';

/**
 * An exercise as a stick figure on a 64px grid, two key poses (A, B) drawn with strokes. While `animate` is on the poses alternate
 * (CSS `steps(1)`); otherwise, and under `prefers-reduced-motion`, only pose A shows. The stroke follows the skin tokens
 * (`--sport-stroke`, `--sport-glow`), with plain fallbacks until a skin sets them. Decorative: the name next to it is the label.
 */
@Component({
  selector: 'app-sportask-pictogram',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" [class.sk-pict--live]="animate()">
      @for (pose of poses(); track pose.key) {
        <g [class]="'sk-pict__pose sk-pict__pose--' + pose.key">
          @for (d of pose.paths; track $index) {
            <path [attr.d]="d" />
          }
        </g>
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      width: var(--sk-pict-size, 64px);
      height: var(--sk-pict-size, 64px);
      color: var(--color-primary);
    }

    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke: currentColor;
      stroke-width: var(--sport-stroke-width, 3);
      stroke-linecap: round;
      stroke-linejoin: round;
      overflow: visible;
      filter: var(--sport-glow, none);
    }

    .sk-pict__pose--b {
      visibility: hidden;
    }

    .sk-pict--live .sk-pict__pose--a {
      animation: sk-pose-a var(--sk-pict-period, 1.2s) steps(1) infinite;
    }

    .sk-pict--live .sk-pict__pose--b {
      animation: sk-pose-b var(--sk-pict-period, 1.2s) steps(1) infinite;
    }

    @keyframes sk-pose-a {
      0% {
        visibility: visible;
      }
      50% {
        visibility: hidden;
      }
    }

    @keyframes sk-pose-b {
      0% {
        visibility: hidden;
      }
      50% {
        visibility: visible;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .sk-pict--live .sk-pict__pose--a,
      .sk-pict--live .sk-pict__pose--b {
        animation: none;
      }
      .sk-pict--live .sk-pict__pose--a {
        visibility: visible;
      }
      .sk-pict--live .sk-pict__pose--b {
        visibility: hidden;
      }
    }
  `,
})
export class SportaskPictogramComponent {
  readonly id = input.required<string>();
  readonly animate = input(false);

  protected readonly poses = computed(() => {
    const p = (PICTOGRAMS as Record<string, { a: string[]; b: string[] } | undefined>)[this.id()] ?? PICTOGRAMS.march;
    return [
      { key: 'a', paths: p.a },
      { key: 'b', paths: p.b },
    ];
  });
}
