import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TimeEntry } from 'src/app/modules/shared/services/timesheet.service';

interface TaskNode { key:string; name:string; minutes:number; entries:TimeEntry[]; }
interface ProjectNode { key:string; name:string; minutes:number; tasks:TaskNode[]; }
interface DayNode { key:string; label:string; minutes:number; projects:ProjectNode[]; }

@Component({selector:'app-workforce-week-tree',templateUrl:'./workforce-week-tree.component.html',styleUrls:['./workforce-week-tree.component.css'],changeDetection:ChangeDetectionStrategy.OnPush})
export class WorkforceWeekTreeComponent {
  days:DayNode[]=[];
  @Input() set entries(value:TimeEntry[]){this.days=this.build(value||[])}
  duration(minutes:number):string{const h=Math.floor(minutes/60),m=minutes%60;return `${h}h${m?` ${m}m`:''}`}
  time(value?:string|null):string{if(!value)return'';const match=String(value).match(/(\d{1,2}):(\d{2})/);if(!match)return'';const hour=Number(match[1]);return `${hour%12||12}:${match[2]} ${hour>=12?'PM':'AM'}`}
  track(_i:number,node:{key:string}):string{return node.key}
  private build(entries:TimeEntry[]):DayNode[]{
    const days=new Map<string,{entries:TimeEntry[]}>();
    entries.forEach(entry=>{const key=String(entry.entry_date||entry.date||'').slice(0,10);if(!key)return;const day=days.get(key)||{entries:[]};day.entries.push(entry);days.set(key,day)});
    return [...days.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([dayKey,day])=>{
      const projects=new Map<string,{name:string;entries:TimeEntry[]}>();
      day.entries.forEach(entry=>{const key=String(entry.project_id||'unassigned');const project=projects.get(key)||{name:entry.project_name||'Unassigned project',entries:[]};project.entries.push(entry);projects.set(key,project)});
      const projectNodes=[...projects.entries()].map(([projectKey,project])=>{
        const tasks=new Map<string,{name:string;entries:TimeEntry[]}>();
        project.entries.forEach(entry=>{const key=String(entry.task_id||entry.task_name||'general');const task=tasks.get(key)||{name:entry.task_name||entry.activity_category_name||'General activity',entries:[]};task.entries.push(entry);tasks.set(key,task)});
        const taskNodes=[...tasks.entries()].map(([taskKey,task])=>({key:taskKey,name:task.name,minutes:task.entries.reduce((n,e)=>n+Number(e.duration_minutes||0),0),entries:task.entries}));
        return{key:projectKey,name:project.name,minutes:project.entries.reduce((n,e)=>n+Number(e.duration_minutes||0),0),tasks:taskNodes};
      });
      const date=new Date(`${dayKey}T00:00:00`);
      return{key:dayKey,label:date.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}),minutes:day.entries.reduce((n,e)=>n+Number(e.duration_minutes||0),0),projects:projectNodes};
    });
  }
}
