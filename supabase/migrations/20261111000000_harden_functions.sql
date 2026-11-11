-- Tighten function permissions (Supabase security advisor)

-- Fixed search_path on helper and trigger functions
alter function public.stamp_item() set search_path = public;
alter function public.is_owner() set search_path = public;
alter function public.is_editor() set search_path = public;
alter function public.is_member() set search_path = public;
alter function public.current_week_start() set search_path = public;
alter function public.guard_profile_update() set search_path = public;

-- Nobody signed out can call anything
revoke execute on all functions in schema public from public, anon;

-- Trigger functions are never called directly
revoke execute on function public.handle_new_user(), public.handle_owner_email(),
  public.log_item_change(), public.stamp_item(), public.guard_profile_update()
  from authenticated;

-- What the app is allowed to call when signed in
grant execute on function public.my_role(), public.is_owner(), public.is_editor(), public.is_member(),
  public.current_week_start(), public.mark_ordered(bigint), public.finish_count(text)
  to authenticated;

-- Future functions start locked down too
alter default privileges in schema public revoke execute on functions from public, anon;
