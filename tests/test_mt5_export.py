import importlib.util
import unittest
from pathlib import Path
from datetime import timezone

spec = importlib.util.spec_from_file_location('mt5_export', Path(__file__).parent.parent / 'scripts/export-mt5.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExportTest(unittest.TestCase):
    def test_timezone_required(self):
        with self.assertRaises(ValueError):
            module.utc_time('2026-12-04T13:30:00')
        self.assertEqual(module.utc_time('2026-12-04T20:30:00+07:00'), module.utc_time('2026-12-04T13:30:00Z'))
        self.assertEqual(module.utc_time('2026-12-04T13:30:00Z').tzinfo, timezone.utc)

    def test_no_stale_or_inverted_quotes(self):
        time = module.utc_time('2026-12-04T13:25:00Z')
        stamp = int(time.timestamp()*1000)
        ticks = [{'time_msc':stamp-1,'bid':1,'ask':2}, {'time_msc':stamp,'bid':3,'ask':2},
                 {'time_msc':stamp+10,'bid':1,'ask':2}, {'time_msc':stamp+5001,'bid':1,'ask':2}]
        self.assertEqual(module.first_quote(ticks,time)['at'],stamp+10)
        with self.assertRaises(ValueError):
            module.first_quote([ticks[0], ticks[-1]],time)


if __name__ == '__main__':
    unittest.main()
