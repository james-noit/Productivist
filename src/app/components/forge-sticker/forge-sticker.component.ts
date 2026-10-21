import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { flavorOf } from '../../../lib/forge-flavors';
import type { ForgeLogo } from '../../../lib/forge-logos';
import type { ForgeFlavor, ForgeKind } from '../../../types/forge';
import { UiIconComponent } from '../ui-icon/ui-icon.component';

const CYCLE_MS = 5600;
/** djb2: only spreads the animation phases. Not `hashString`: importing `sync-engine` from a lazy chunk makes the bundler split it out of the initial one. */
const phaseOf = (seed: string): number => {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 33) + seed.charCodeAt(i)) >>> 0;
  return h % CYCLE_MS;
};
/** The logo data (~4 kB of paths) is fetched once, by the first sticker that shows a known platform. */
let logos: Promise<Record<ForgeFlavor, ForgeLogo>> | null = null;
const loadLogos = () => (logos ??= import('../../../lib/forge-logos').then((m) => m.FORGE_LOGOS));
const PX = { xs: 14, sm: 18, md: 28 } as const;

/**
 * A platform "sticker": the logo of GitHub, GitLab, Forgejo, Codeberg or Gitea on its brand colour, with a die-cut
 * edge, floating a little over a soft ground shadow. It names the forge an account or an imported project belongs to.
 * Pass the `flavor`, or the `source` (`kind` + `host`) and it is worked out; `flavor` wins. With a `label` it is an
 * image with that name, without one it is decorative (the caller already says the name). `float` is `always`, `hover`
 * (starts while the closest `.prow` is hovered or has focus inside) or `never`; `seed` (any stable id) only offsets
 * the animation so a grid of stickers does not bob in unison. The glyph is a fill in the official shape and the
 * sticker only ever translates: brand rules forbid rotating or distorting the mark. The logo data is a dynamic
 * `import()` of `lib/forge-logos.ts` (not a `@defer` of this component: a lazy entry that reaches only Angular core makes
 * the bundler split `local-storage-signal` out of the initial chunk), so it loads only when a sticker shows a platform;
 * until it arrives the sticker is invisible.
 */
@Component({
  selector: 'app-forge-sticker',
  standalone: true,
  imports: [UiIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './forge-sticker.component.html',
  styleUrl: './forge-sticker.component.css',
  host: {
    class: 'sticker',
    '[class.sticker--xs]': "size() === 'xs'",
    '[class.sticker--sm]': "size() === 'sm'",
    '[class.sticker--md]': "size() === 'md'",
    '[class.sticker--pending]': 'pending()',
    '[class.sticker--always]': "float() === 'always'",
    '[class.sticker--hover]': "float() === 'hover'",
    '[attr.role]': "label() ? 'img' : null",
    '[attr.aria-label]': 'label()',
    '[attr.title]': 'label()',
    '[attr.aria-hidden]': "label() ? null : 'true'",
    '[style.--sticker-size.px]': 'px()',
    '[style.--sticker-delay]': 'delay()',
    '[style.--sticker-face]': 'logo()?.face',
    '[style.--sticker-ink]': 'logo()?.ink',
  },
})
export class ForgeStickerComponent {
  readonly flavor = input<ForgeFlavor | null>(null);
  readonly source = input<{ kind: ForgeKind; host: string } | null>(null);
  readonly size = input<'xs' | 'sm' | 'md'>('sm');
  readonly label = input<string | null>(null);
  readonly float = input<'always' | 'hover' | 'never'>('always');
  readonly seed = input('');

  protected readonly px = computed(() => PX[this.size()]);

  private readonly all = signal<Record<ForgeFlavor, ForgeLogo> | null>(null);

  private readonly id = computed(() => {
    const flavor = this.flavor();
    const source = this.source();
    return flavor ?? (source ? flavorOf(source.kind, source.host).id : null);
  });

  /** The brand logo, or null for an unknown flavour (a neutral face with the generic git mark) or while it loads. */
  protected readonly logo = computed(() => {
    const id = this.id();
    return id ? (this.all()?.[id] ?? null) : null;
  });

  /** A known platform whose logo has not arrived yet. */
  protected readonly pending = computed(() => !!this.id() && !this.logo() && !this.all());

  constructor() {
    void loadLogos().then((all) => this.all.set(all));
  }

  /** A negative delay starts the animation mid-cycle, a different one per seed. */
  protected readonly delay = computed(() => `${-phaseOf(this.seed())}ms`);
}
