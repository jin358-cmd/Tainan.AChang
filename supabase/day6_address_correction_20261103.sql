-- Owner correction; keep the original PDF and batch audit requests unchanged.
update public.visit_tasks t set visit_address='中華西街196巷2號',updated_at=now()
from public.assignments a
where a.id=t.assignment_id and a.route_id='PDF:日間:日間6:AAQ-059'
and t.stop_order=1 and t.visit_address='中華西路196巷口';
