"""Read-only XAUUSD quote export from an already logged-in Windows MT5 terminal.

No login credentials, order placement, or position changes. Times are explicit UTC.
Requires: pip install MetaTrader5 (on the PC running the broker terminal).
"""
import argparse
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path


def utc_time(value):
    time = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if time.tzinfo is None:
        raise ValueError('Waktu harus memiliki zona: contoh 2026-12-04T13:30:00Z.')
    return time.astimezone(timezone.utc)


def first_quote(ticks, boundary):
    start = int(boundary.timestamp() * 1000)
    candidates = [] if ticks is None else [
        {'at': int(t['time_msc']), 'bid': float(t['bid']), 'ask': float(t['ask'])}
        for t in ticks if start <= int(t['time_msc']) <= start + 5000
        and math.isfinite(float(t['bid'])) and math.isfinite(float(t['ask']))
        and 0 < float(t['bid']) <= float(t['ask'])
    ]
    if not candidates:
        raise ValueError('Tidak ada bid/ask valid dalam 5 detik setelah batas. Event tidak diekspor.')
    return min(candidates, key=lambda q: q['at'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--broker', choices=['HFM', 'Exness'], required=True)
    parser.add_argument('--feed', required=True, help='Label jenis akun, misalnya demo-standard; jangan masukkan nomor akun.')
    parser.add_argument('--symbol', required=True, help='Simbol persis di terminal, misalnya XAUUSD atau XAUUSDm.')
    parser.add_argument('--release', action='append', required=True, help='Timestamp rilis resmi, ISO dengan zona. Dapat diulang.')
    parser.add_argument('--cost-per-oz', type=float, required=True, help='Asumsi komisi + slippage pulang-pergi dalam USD/oz, di luar spread.')
    parser.add_argument('--terminal', help='Path terminal64.exe jika beberapa terminal terpasang.')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if not args.symbol.upper().startswith('XAUUSD') or not math.isfinite(args.cost_per_oz) or args.cost_per_oz < 0:
        parser.error('Gunakan XAUUSD dan biaya nonnegatif yang finite.')
    if '\n' in args.feed or not args.feed.strip():
        parser.error('Label jenis akun tidak valid.')
    releases = sorted(set(utc_time(s) for s in args.release))
    if any(r + timedelta(seconds=65) > datetime.now(timezone.utc) for r in releases):
        parser.error('Rilis harus sudah melewati T+65 detik.')
    import MetaTrader5 as mt5
    connected = mt5.initialize(args.terminal) if args.terminal else mt5.initialize()
    if not connected:
        raise RuntimeError('Terminal MT5 tidak tersambung. Buka terminal dan login sendiri terlebih dahulu.')
    try:
        account = mt5.account_info()
        company = account.company.lower() if account else ''
        allowed = ['exness'] if args.broker == 'Exness' else ['hf markets', 'hfm', 'hotforex', 'hfmarkets']
        if not account or not any(name in company for name in allowed):
            raise RuntimeError('Broker terminal tidak cocok dengan --broker. Periksa terminal yang dipilih.')
        info = mt5.symbol_info(args.symbol)
        if info is None or info.currency_profit != 'USD':
            raise RuntimeError('Simbol tidak tersedia atau mata uang profit bukan USD.')
        feed = f'{account.server} / {args.feed.strip()}'
        outcomes = []
        for release in releases:
            entry_at, exit_at = release - timedelta(minutes=5), release + timedelta(minutes=1)
            entry = first_quote(mt5.copy_ticks_range(args.symbol, entry_at, entry_at + timedelta(seconds=5), mt5.COPY_TICKS_ALL), entry_at)
            exit_quote = first_quote(mt5.copy_ticks_range(args.symbol, exit_at, exit_at + timedelta(seconds=5), mt5.COPY_TICKS_ALL), exit_at)
            now = int(datetime.now(timezone.utc).timestamp() * 1000)
            stamp = int(release.timestamp() * 1000)
            outcomes.append({'id': f'{args.broker}-{args.symbol}-{stamp}-{now}', 'release': stamp,
                             'broker': args.broker, 'feed': feed, 'symbol': args.symbol,
                             'entry': entry, 'exit': exit_quote, 'cost': args.cost_per_oz,
                             'source': 'MT5 copy_ticks_range; terminal broker; UTC; first quote within 5 seconds after boundary',
                             'recordedAt': now})
        result = {'version': 1, 'releases': [], 'events': [], 'outcomes': outcomes}
        # Refuse overwriting an existing export.
        with Path(args.output).open('x', encoding='utf-8') as file:
            json.dump(result, file, ensure_ascii=False, indent=2, allow_nan=False)
        print(f'{len(outcomes)} event diekspor. Pindahkan JSON ke Android lalu gunakan Impor dataset / harga.')
    finally:
        mt5.shutdown()


if __name__ == '__main__':
    main()
