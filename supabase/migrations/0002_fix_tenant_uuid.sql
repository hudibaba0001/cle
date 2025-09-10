-- Fix demo tenant UUID format
-- Update the services table first (foreign key constraint)
UPDATE public.services 
SET tenant_id = '8f98ad87-3f30-432d-9b00-f2a7c1c76c63' 
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- Then update the tenants table
UPDATE public.tenants 
SET id = '8f98ad87-3f30-432d-9b00-f2a7c1c76c63' 
WHERE id = '00000000-0000-0000-0000-000000000001';
