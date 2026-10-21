import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PICTOGRAMS } from '../../../lib/sportask/pictogram-paths';

/**
 * An exercise as a stick figure on a 64px grid, two key poses (A, B) drawn with strokes. While `animate` is on the poses alternate
 * (CSS `steps(1)` at the pictogram's own tempo); otherwise, and under `prefers-reduced-motion`, only pose A shows. Each pose has a
 * `main` layer (body and equipment) and a `soft` one (far limbs, floor), drawn twice: first an ink outline (`--sport-ink`, as wide as
 * `--sport-ink-width`, nothing when that is 0), then the stroke itself (`--sport-stroke`, `--sport-stroke-width`, with the skin's
 * glow filter). Plain fallbacks apply until a skin sets the tokens. Decorative: the name next to it is the label.
 */
@Component({
  selector: 'app-sportask-pictogram',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" [class.sk-pict--live]="animate()" [style.--sk-pict-period]="tempo() + 's'">
      @for (pose of poses(); track pose.key) {
        <g [class]="'sk-pict__pose sk-pict__pose--' + pose.key">
          <path class="sk-pict__ink sk-pict__soft" [attr.d]="pose.soft" />
          <path class="sk-pict__line sk-pict__soft" [attr.d]="pose.soft" />
          <path class="sk-pict__ink" [attr.d]="pose.main" />
          <path class="sk-pict__line" [attr.d]="pose.main" />
        </g>
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--sk-pict-size, 64px);
      height: var(--sk-pict-size, 64px);
    }

    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      overflow: visible;
    }

    path {
      fill: none;
    }

    .sk-pict__line {
      stroke: var(--sport-stroke, var(--color-primary));
      stroke-width: var(--sport-stroke-width, 3);
      filter: var(--sport-glow-filter, none);
    }

    .sk-pict__ink {
      stroke: var(--sport-ink, transparent);
      stroke-width: var(--sport-ink-width, 0);
    }

    .sk-pict__line.sk-pict__soft {
      stroke-width: calc(var(--sport-stroke-width, 3) * 0.78);
      opacity: var(--sport-soft-opacity, 0.5);
      filter: none;
    }

    .sk-pict__ink.sk-pict__soft {
      stroke-width: calc(var(--sport-ink-width, 0) * 0.78);
      opacity: var(--sport-soft-opacity, 0.5);
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
      50%,
      100% {
        visibility: hidden;
      }
    }

    @keyframes sk-pose-b {
      0% {
        visibility: hidden;
      }
      50%,
      100% {
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

  private readonly drawing = computed(() => (PICTOGRAMS as Record<string, (typeof PICTOGRAMS)[keyof typeof PICTOGRAMS] | undefined>)[this.id()] ?? PICTOGRAMS.march);

  protected readonly tempo = computed(() => this.drawing().tempo);
  protected readonly poses = computed(() => {
    const p = this.drawing();
    return [
      { key: 'a', main: p.a.main.join(''), soft: p.a.soft.join('') },
      { key: 'b', main: p.b.main.join(''), soft: p.b.soft.join('') },
    ];
  });
}
