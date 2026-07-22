import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { WorkforceSidebarUser } from 'src/app/modules/shared/helpers/activity-api.mapper';

@Component({selector:'app-workforce-employee-directory',templateUrl:'./workforce-employee-directory.component.html',styleUrls:['./workforce-employee-directory.component.css'],changeDetection:ChangeDetectionStrategy.OnPush})
export class WorkforceEmployeeDirectoryComponent {
  @Input() users: WorkforceSidebarUser[]=[]; @Input() selectedId=''; @Input() loading=false; @Input() open=false;
  @Output() selected=new EventEmitter<string>(); @Output() openChange=new EventEmitter<boolean>();
  search=''; filter='active';
  get filtered(): WorkforceSidebarUser[] { const q=this.search.trim().toLowerCase(); return this.users.filter(u=>(!q||[u.name,u.email,u.role].some(v=>String(v||'').toLowerCase().includes(q)))&&(this.filter==='all'||this.filter==='active'&&u.isActive||this.filter==='inactive'&&!u.isActive)).sort((a,b)=>a.name.localeCompare(b.name)); }
  choose(id:string):void{this.selected.emit(id);this.openChange.emit(false)}
  track(_i:number,u:WorkforceSidebarUser):string{return u.id}
}
