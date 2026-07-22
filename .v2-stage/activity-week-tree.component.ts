import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { TimeEntry } from '../../services/timesheet.service';

interface ActivityTaskNode { key:string; label:string; totalMinutes:number; entries:TimeEntry[]; }
interface ActivityProjectNode { key:string; name:string; totalMinutes:number; entryCount:number; tasks:ActivityTaskNode[]; }

@Component({selector:'app-activity-week-tree',templateUrl:'./activity-week-tree.component.html',styleUrls:['./activity-week-tree.component.css'],changeDetection:ChangeDetectionStrategy.OnPush})
export class ActivityWeekTreeComponent {
  @Input() readonly=true; @Input() categories:any[]=[];
  @Output() editEntry=new EventEmitter<TimeEntry>(); @Output() deleteEntry=new EventEmitter<TimeEntry>(); @Output() editWeek=new EventEmitter<void>();
  projects:ActivityProjectNode[]=[];projectExpansion=new Set<string>();taskExpansion=new Set<string>();
  @Input() set entries(value:TimeEntry[]){this.projects=this.build(value||[]);this.projectExpansion.clear();this.taskExpansion.clear();if(this.projects[0])this.projectExpansion.add(this.projects[0].key)}
  toggleProject(key:string):void{this.projectExpansion.has(key)?this.projectExpansion.delete(key):this.projectExpansion.add(key)}
  toggleTask(key:string):void{this.taskExpansion.has(key)?this.taskExpansion.delete(key):this.taskExpansion.add(key)}
  duration(minutes:number):string{const h=Math.floor(Number(minutes||0)/60),m=Number(minutes||0)%60;return `${h}h${m?` ${m}m`:''}`}
  date(value:string):string{return value?new Date(`${value.slice(0,10)}T00:00:00`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}):'—'}
  category(entry:TimeEntry):string{return entry.activity_category_name||this.categories.find(c=>String(c.id)===String(entry.activity_category_id))?.name||'Activity'}
  track(_i:number,node:{key:string}):string{return node.key}trackEntry(_i:number,entry:TimeEntry):string{return String(entry.id)}
  private build(entries:TimeEntry[]):ActivityProjectNode[]{const grouped=new Map<string,ActivityProjectNode>();for(const entry of entries){const projectKey=String(entry.project_id??'general');let project=grouped.get(projectKey);if(!project){project={key:projectKey,name:entry.project_name||(entry.project_id?'Deleted project':'General work'),totalMinutes:0,entryCount:0,tasks:[]};grouped.set(projectKey,project)}project.totalMinutes+=Number(entry.duration_minutes||0);project.entryCount++;const taskId=entry.task_id?String(entry.task_id):null,taskKey=`${projectKey}::${taskId||'general'}`;let task=project.tasks.find(row=>row.key===taskKey);if(!task){task={key:taskKey,label:entry.task_name||(entry.task_id?'Deleted Task':entry.entry_type==='add-activity'?'Manual activity':'General Activity'),totalMinutes:0,entries:[]};project.tasks.push(task)}task.totalMinutes+=Number(entry.duration_minutes||0);task.entries.push(entry)}return[...grouped.values()].map(project=>({...project,tasks:project.tasks.map(task=>({...task,entries:[...task.entries].sort((a,b)=>String(a.entry_date).localeCompare(String(b.entry_date)))})).sort((a,b)=>b.totalMinutes-a.totalMinutes)})).sort((a,b)=>b.totalMinutes-a.totalMinutes)}
}
