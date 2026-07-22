import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import dayjs, { Dayjs } from 'dayjs';

export interface WorkforceDateRange { startDate: Dayjs | null; endDate: Dayjs | null; }

@Component({
  selector: 'app-workforce-date-range-filter',
  template: `
    <div class="wr-range-wrap">
      <button type="button" class="wr-range" (click)="openPicker()" [attr.aria-expanded]="open" aria-haspopup="dialog">
        <i class="ri-calendar-line" aria-hidden="true"></i><span>{{ label }}</span><i class="ri-arrow-down-s-line" aria-hidden="true"></i>
      </button>
      <section class="wr-picker" *ngIf="open" role="dialog" aria-label="Choose reporting date range" (keydown.escape)="cancel()">
        <div class="wr-presets" aria-label="Date range presets">
          <button type="button" (click)="selectAllHistory()" [class.active]="!draftStart && !draftEnd">All History</button>
          <button type="button" *ngFor="let preset of presets" (click)="selectPreset(preset)" [class.active]="isPresetActive(preset)">{{ preset.label }}</button>
        </div>
        <div class="wr-custom">
          <header><strong>Custom range</strong><span>Choose a start and end date</span></header>
          <div class="wr-fields">
            <label><span>Start date</span><input type="date" [(ngModel)]="draftStart" [max]="draftEnd || maxDate" /></label>
            <i class="ri-arrow-right-line" aria-hidden="true"></i>
            <label><span>End date</span><input type="date" [(ngModel)]="draftEnd" [min]="draftStart" [max]="maxDate" /></label>
          </div>
          <p class="wr-error" *ngIf="invalid">Select a valid range where the start date is before the end date.</p>
        </div>
        <footer><button type="button" class="reset" (click)="selectAllHistory()">Clear · All History</button><span></span><button type="button" (click)="cancel()">Cancel</button><button type="button" class="apply" (click)="apply()" [disabled]="invalid">Apply filter</button></footer>
      </section>
    </div>
  `,
  styles: [`
    :host{display:block}.wr-range-wrap{position:relative}.wr-range{height:36px;min-width:244px;display:flex;align-items:center;gap:8px;padding:0 11px;border:1px solid var(--pts-border-strong);border-radius:8px;background:var(--pts-bg-elevated);color:var(--pts-text);font:inherit;font-size:12px;font-weight:650;cursor:pointer}.wr-range span{flex:1;text-align:left}.wr-range:hover{border-color:var(--pts-primary)}button:focus-visible,input:focus-visible{outline:2px solid var(--pts-primary);outline-offset:2px}.wr-picker{position:absolute;top:43px;right:0;z-index:200;width:560px;display:grid;grid-template-columns:155px 1fr;border:1px solid var(--pts-border-strong);border-radius:11px;background:var(--pts-bg-surface);box-shadow:0 24px 70px rgba(0,0,0,.48);overflow:hidden}.wr-presets{display:flex;flex-direction:column;gap:3px;padding:10px;border-right:1px solid var(--pts-border);background:var(--pts-bg-elevated)}.wr-presets button{height:32px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--pts-text-secondary);font:inherit;font-size:10px;text-align:left;cursor:pointer}.wr-presets button:hover,.wr-presets button.active{background:rgba(133,139,255,.13);color:var(--pts-primary)}.wr-custom{padding:15px}.wr-custom header{display:flex;flex-direction:column;gap:2px;margin-bottom:14px}.wr-custom strong{color:var(--pts-text);font-size:12px}.wr-custom header span{color:var(--pts-text-muted);font-size:9px}.wr-fields{display:grid;grid-template-columns:1fr 18px 1fr;align-items:end;gap:8px}.wr-fields>i{padding-bottom:9px;color:var(--pts-text-muted)}label{display:flex;flex-direction:column;gap:6px}label span{color:var(--pts-text-muted);font-size:9px;font-weight:700;text-transform:uppercase}input{height:36px;min-width:0;padding:0 8px;border:1px solid var(--pts-border);border-radius:7px;background:var(--pts-bg-elevated);color:var(--pts-text);color-scheme:dark;font:inherit;font-size:10px}.wr-error{margin:8px 0 0;color:#fca5a5;font-size:9px}.wr-picker footer{grid-column:1/-1;display:flex;align-items:center;gap:7px;padding:10px;border-top:1px solid var(--pts-border)}.wr-picker footer span{flex:1}.wr-picker footer button{height:30px;padding:0 10px;border:1px solid var(--pts-border);border-radius:6px;background:transparent;color:var(--pts-text-secondary);font:inherit;font-size:9px;font-weight:700;cursor:pointer}.wr-picker footer .reset{border:0;color:var(--pts-text-muted)}.wr-picker footer .apply{border-color:var(--pts-primary);background:var(--pts-primary);color:white}.wr-picker footer button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:650px){.wr-range{width:100%;min-width:0}.wr-picker{position:fixed;inset:auto 10px 10px;width:auto;max-height:calc(100dvh - 20px);grid-template-columns:1fr}.wr-presets{display:grid;grid-template-columns:repeat(2,1fr);border-right:0;border-bottom:1px solid var(--pts-border)}.wr-picker footer{grid-column:auto;flex-wrap:wrap}.wr-picker footer .reset{width:100%;text-align:left}.wr-picker footer span{display:none}.wr-picker footer button:not(.reset){flex:1}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkforceDateRangeFilterComponent {
  @Input() set value(value: WorkforceDateRange) { this.committed = value; if (!this.open) this.syncDraft(); }
  @Output() valueChange = new EventEmitter<WorkforceDateRange>();
  committed: WorkforceDateRange = { startDate: null, endDate: null };
  draftStart = ''; draftEnd = ''; open = false;
  readonly maxDate = dayjs().endOf('month').format('YYYY-MM-DD');
  readonly presets: Array<{ label: string; start: Dayjs; end: Dayjs }> = [
    { label: 'This Month', start: dayjs().startOf('month'), end: dayjs().endOf('month') },
    { label: 'Last Month', start: dayjs().subtract(1, 'month').startOf('month'), end: dayjs().subtract(1, 'month').endOf('month') },
    { label: 'Last 3 Months', start: dayjs().subtract(3, 'month').startOf('day'), end: dayjs() },
    { label: 'Last 6 Months', start: dayjs().subtract(6, 'month').startOf('day'), end: dayjs() },
    { label: 'This Year', start: dayjs().startOf('year'), end: dayjs().endOf('year') },
  ];
  constructor(private host: ElementRef<HTMLElement>) { this.syncDraft(); }
  get label(): string { return !this.committed.startDate || !this.committed.endDate ? 'All History' : `${this.committed.startDate.format('MMM D, YYYY')} – ${this.committed.endDate.format('MMM D, YYYY')}`; }
  get invalid(): boolean { return (!!this.draftStart !== !!this.draftEnd) || (!!this.draftStart && (!dayjs(this.draftStart).isValid() || !dayjs(this.draftEnd).isValid() || dayjs(this.draftStart).isAfter(dayjs(this.draftEnd)))); }
  openPicker(): void { this.syncDraft(); this.open = !this.open; }
  selectPreset(preset: { start: Dayjs; end: Dayjs }): void { this.draftStart = preset.start.format('YYYY-MM-DD'); this.draftEnd = preset.end.format('YYYY-MM-DD'); }
  isPresetActive(preset: { start: Dayjs; end: Dayjs }): boolean { return this.draftStart === preset.start.format('YYYY-MM-DD') && this.draftEnd === preset.end.format('YYYY-MM-DD'); }
  apply(): void { if (this.invalid) return; this.committed = this.draftStart ? { startDate: dayjs(this.draftStart), endDate: dayjs(this.draftEnd) } : { startDate: null, endDate: null }; this.open = false; this.valueChange.emit(this.committed); }
  cancel(): void { this.syncDraft(); this.open = false; }
  selectAllHistory(): void { this.draftStart = ''; this.draftEnd = ''; }
  @HostListener('document:mousedown', ['$event']) outside(event: MouseEvent): void { if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.cancel(); }
  private syncDraft(): void { this.draftStart = this.committed.startDate?.format('YYYY-MM-DD') || ''; this.draftEnd = this.committed.endDate?.format('YYYY-MM-DD') || ''; }
  private monday(date: Dayjs): Dayjs { return date.startOf('day').subtract((date.day() + 6) % 7, 'day'); }
}
