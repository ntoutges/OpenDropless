An extremely basic simulator for the OpenDrop device.\
This project features two modes of connection:

1. USB (Available on most chromium-based browsers)
    * In some way, forward a serial port on your computer to another serial port, also on your computer (this may be through a TTL-TTL cable, or some smarter software solution).
    * Click the 'Serial' button in the connection popup, and select your serial port.

2. Socket (Available everywhere)
    * Ensure that your code is running a socket server on port 3000.
    * This socket server should send comma-separated string numbers that follow the standard OpenDrop protocol.
    * Click the 'Socket' button in the connection popup.