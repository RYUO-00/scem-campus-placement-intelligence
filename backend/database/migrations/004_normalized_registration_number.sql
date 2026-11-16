DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM students
    GROUP BY upper(btrim(registration_number))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce normalized registration-number uniqueness: existing rows collide after trimming and uppercasing.';
  END IF;
END $$;

DROP INDEX IF EXISTS idx_students_registration_number_ci;
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_registration_number_normalized
  ON students (upper(btrim(registration_number)));
