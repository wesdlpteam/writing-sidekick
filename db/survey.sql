-- Trial survey (api/_survey.js). One anonymous row per child: no name, time, device or class.
CREATE TABLE IF NOT EXISTS survey (
  id SERIAL PRIMARY KEY,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  year_level SMALLINT NOT NULL CHECK (year_level BETWEEN 1 AND 6),
  understood TEXT CHECK (understood IN ('yes', 'bit', 'no')),
  liked TEXT CHECK (liked IN ('yes', 'bit', 'no')),
  stronger TEXT CHECK (stronger IN ('yes', 'bit', 'no'))
);
