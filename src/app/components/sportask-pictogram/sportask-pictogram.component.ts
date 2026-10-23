import { ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, computed, effect, inject, input, signal } from '@angular/core';
import { PICTOGRAMS, tweenOf, type Part, type Pictogram } from '../../../lib/sportask/pictogram-paths';

/** What a run of parts is drawn as: the ground and furniture share one group (so overlapping strokes do not darken), the rest is drawn one by one. */
interface Item {
  group: boolean;
  parts: { i: number; part: Part }[];
}

/**
 * Sets `values` of an `<animate>` from code: a bound `[attr.values]` there goes through Angular's URL sanitizer, which would be pulled
 * into the initial bundle (+1 kB, measured).
 */
@Directive({ selector: 'animate[appValues]', standalone: true })
export class PictogramValuesDirective {
  readonly appValues = input.required<string>();

  constructor() {
    const el = inject<ElementRef<SVGElement>>(ElementRef).nativeElement;
    effect(() => el.setAttribute('values', this.appValues()));
  }
}

/**
 * An exercise as a figure on a 64px grid, two key poses (A, B) of one body (docs/sportask/PICTOGRAMS.md). While `animate` is on the figure
 * moves between them (SMIL on the paths' `d`, eased, through `tweenOf`'s in-between frames; one cycle takes the pictogram's tempo);
 * otherwise, and under `prefers-reduced-motion`, only pose A shows, with the other pose as a faint dashed ghost behind it (not at small
 * sizes), so the direction is still readable. The parts are drawn back to front: ground and furniture, the far limbs (dimmer), the torso,
 * the near limbs, the head, the equipment and a dot on each joint. Every part but the ground, the far limbs and the dots gets a halo
 * first (`--sport-halo`, `--sport-halo-width`: the surface colour by default, cyberpunk's dark ink), so a limb in front of the body or
 * of another limb stays separate. Colours: `--sport-stroke` (body), `--sport-prop` (equipment), `--sport-halo`; widths scale with
 * `--sport-stroke-width`; the far limbs and the ground use `--sport-soft-opacity`; `--sport-glow-filter` glows the figure. Plain fallbacks
 * from the theme apply until a skin sets the tokens. Decorative: the name next to it is the label.
 */
@Component({
  selector: 'app-sportask-pictogram',
  standalone: true,
  imports: [PictogramValuesDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      @if (ghost(); as g) {
        <path class="sk-pict__ghost" [attr.d]="g" />
      }
      @for (item of items(); track $index) {
        @if (item.group) {
          <g class="sk-pict__set">
            @for (p of item.parts; track p.i) {
              <path class="sk-pict__line sk-pict__set-line" [style.--w]="p.part.w" [attr.d]="p.part.d" />
            }
          </g>
        } @else {
          @for (p of item.parts; track p.i) {
            @if (p.part.r !== 'far' && p.part.r !== 'dot') {
              <path [class]="'sk-pict__halo sk-pict__' + p.part.r" [style.--w]="p.part.w" [attr.d]="p.part.d">
                @if (tween(); as t) {
                  <animate attributeName="d" [appValues]="t.values[p.i]!.join(';')" [attr.keyTimes]="t.keyTimes" [attr.dur]="dur()" repeatCount="indefinite" calcMode="linear" />
                }
              </path>
            }
            <path [class]="'sk-pict__line sk-pict__' + p.part.r + (p.part.f ? ' sk-pict__fill' + p.part.f : '')" [style.--w]="p.part.w" [attr.d]="p.part.d">
              @if (tween(); as t) {
                <animate attributeName="d" [appValues]="t.values[p.i]!.join(';')" [attr.keyTimes]="t.keyTimes" [attr.dur]="dur()" repeatCount="indefinite" calcMode="linear" />
              }
            </path>
          }
        }
      }
    </svg>
  `,
  styles: `
    :host {
      --sk-k: calc(var(--sport-stroke-width, 3) / 3);
      --sk-line: var(--sport-stroke, var(--color-primary));
      --sk-prop: var(--sport-prop, var(--color-quadrant-schedule, var(--sk-line)));
      --sk-halo: var(--sport-halo, var(--sport-card-bg, var(--color-surface, transparent)));
      --sk-halo-w: var(--sport-halo-width, 1.2);
      --sk-soft: var(--sport-soft-opacity, 0.5);
      display: inline-flex;
      flex: none;
      width: var(--sk-pict-size, 64px);
      height: var(--sk-pict-size, 64px);
      container-type: inline-size;
    }

    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      overflow: visible;
      /* The skin's glow, once for the whole figure (a filter per part would be redrawn on every frame of the animation). */
      filter: var(--sport-glow-filter, none);
    }

    path {
      fill: none;
    }

    .sk-pict__line {
      stroke: var(--sk-line);
      stroke-width: calc(var(--w) * var(--sk-k));
    }

    .sk-pict__halo {
      stroke: var(--sk-halo);
      stroke-width: calc(var(--w) * var(--sk-k) + 2 * var(--sk-halo-w));
    }

    .sk-pict__far {
      stroke-width: calc(var(--w) * var(--sk-k) * 0.86);
      opacity: var(--sk-soft);
    }

    .sk-pict__set {
      opacity: calc(var(--sk-soft) * 0.8);
    }

    .sk-pict__dot {
      stroke: var(--sk-halo);
    }

    .sk-pict__head.sk-pict__line {
      fill: var(--sk-line);
    }

    .sk-pict__prop.sk-pict__line {
      stroke: var(--sk-prop);
    }

    .sk-pict__prop.sk-pict__fill1 {
      fill: var(--sk-prop);
    }

    .sk-pict__prop.sk-pict__fill2 {
      fill: var(--sk-prop);
      fill-opacity: 0.22;
    }

    .sk-pict__ghost {
      stroke: var(--sk-line);
      stroke-width: 0.9;
      stroke-dasharray: 1.2 2;
      opacity: 0.55;
      display: none;
    }

    @container (min-width: 80px) {
      .sk-pict__ghost {
        display: inline;
      }
    }
  `,
})
export class SportaskPictogramComponent {
  readonly id = input.required<string>();
  readonly animate = input(false);

  private readonly reduced = signal(false);

  constructor() {
    const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined;
    if (query) {
      this.reduced.set(query.matches);
      const on = (e: MediaQueryListEvent): void => this.reduced.set(e.matches);
      query.addEventListener('change', on);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', on));
    }
  }

  private readonly drawing = computed<Pictogram>(() => (PICTOGRAMS as Record<string, Pictogram | undefined>)[this.id()] ?? PICTOGRAMS.march);
  protected readonly moving = computed(() => this.animate() && !this.reduced());
  protected readonly tween = computed(() => (this.moving() ? tweenOf(this.drawing()) : null));
  protected readonly dur = computed(() => this.drawing().tempo + 's');

  protected readonly items = computed<Item[]>(() => {
    const items: Item[] = [];
    this.drawing().a.parts.forEach((part, i) => {
      const group = part.r === 'set';
      const last = items[items.length - 1];
      if (group && last?.group) last.parts.push({ i, part });
      else items.push({ group, parts: [{ i, part }] });
    });
    return items;
  });

  /** The other pose as one dashed path (skeleton lines and the head), for a still figure. */
  protected readonly ghost = computed(() => {
    if (this.moving()) return null;
    return this.drawing()
      .b.parts.filter((p) => p.r === 'torso' || p.r === 'limb' || p.r === 'far' || (p.r === 'head' && p.w > 0.5))
      .map((p) => p.d)
      .join('');
  });
}
