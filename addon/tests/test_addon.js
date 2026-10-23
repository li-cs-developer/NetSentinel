const addon = require('../../build/Release/netsentinel_addon');

console.log('exports:', Object.keys(addon).sort().join(', '));

let ticks = 0;

addon.onStats((snap) => {
    ticks++;
    console.log(
        `[tick ${ticks}] pkts=${snap.total_packets} ` +
        `tcp=${snap.tcp_packets} udp=${snap.udp_packets} ` +
        `icmp=${snap.icmp_packets} ipv4=${snap.ipv4_packets} ` +
        `other=${snap.other_packets}`
    );
}, 1000);

const iface = process.argv[2] || null;
addon.startCapture(iface)
    .then((name) => {
        console.log(`capture running on: ${name}`);
        console.log('isRunning:', addon.isRunning());
        console.log('ping 127.0.0.1 -c 5 from another terminal now.');
    })
    .catch((err) => {
        console.error('startCapture failed:', err.message);
        process.exit(1);
    });

// Keep the event loop alive between ticks. Without this, Node drains
// the loop after the first TSFN callback returns.
const keepAlive = setInterval(() => {}, 60_000);

process.on('SIGINT', async () => {
    console.log('\nSIGINT — stopping');
    clearInterval(keepAlive);
    try {
        await addon.stopCapture();
        console.log('stopCapture resolved');
    } catch (err) {
        console.error('stopCapture failed:', err.message);
    }
    console.log('final stats:', addon.getStats());
    process.exit(0);
});