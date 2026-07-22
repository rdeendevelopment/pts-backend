import { NgModule } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CoreModule } from '../core/core.module';
import { A11yModule } from '@angular/cdk/a11y';
import { OverlayModule } from '@angular/cdk/overlay';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { SmartSelectComponent } from './components/smart-select/smart-select.component';


// Components & Pipes
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { NavbarComponent } from './components/navbar/navbar.component';
import { SearchFilterPipe } from './pipes/search-filter.pipe';
import { DecimalTimePipe } from './pipes/decimal.pipe';
import { AvatarUrlPipe } from './pipes/avatar-url.pipe';
import { TimerDisplayComponent } from './components/timer-display/timer-display.component';
import { UserProjectSummaryComponent } from './components/timeSheets/user-project-summary/user-project-summary.component';
import { TaskNotificationBellComponent } from './components/task-notification-bell/task-notification-bell.component';
import { AnnouncementBarComponent } from './components/announcement-bar/announcement-bar.component';
import { ProjectTeamAssignmentComponent } from './components/project-team-assignment/project-team-assignment.component';
import { ProjectCapacityPanelComponent } from './components/project-capacity-panel/project-capacity-panel.component';
import { SharedPaginationComponent } from './components/shared-pagination/shared-pagination.component';
import { ActivityWeekTreeComponent } from './components/activity-week-tree/activity-week-tree.component';
const ComponentsList = [
  SidebarComponent,
  NavbarComponent,
  SearchFilterPipe,
  DecimalTimePipe,
  AvatarUrlPipe,
  TimerDisplayComponent,
  UserProjectSummaryComponent,
  TaskNotificationBellComponent,
  AnnouncementBarComponent,
  ProjectTeamAssignmentComponent,
  ProjectCapacityPanelComponent,
  SmartSelectComponent,
  SharedPaginationComponent,
  ActivityWeekTreeComponent,
];

@NgModule({
  declarations: [...ComponentsList],
  imports: [CommonModule, CoreModule, RouterModule, A11yModule, OverlayModule, ScrollingModule, FormsModule],
  exports: [...ComponentsList, ScrollingModule],
  providers: [DatePipe],
})
export class SharedModule { }
