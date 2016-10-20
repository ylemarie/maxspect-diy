Projet 
------
Pouvoir gérer mes 8 rampes Maxspect Razor DIY http://www.recifal-france.fr/rampe-diy-maxpect-r420-150-t26852.html

Contraintes : 
- interface web pour visualiser la T° des rampes, le % de pwm en cours
- interface web pour contrôler le % de pwm, le switch on/off des ventilateurs
- définir comme sur les Maxspect des "Time Period" avec %blue et %white sur des tranches horaires
- mettre en route les ventilos sur une T° de consigne
- avoir une 2ième sécurité sur la T°, ie une atténuation de xx% de chaque canal si le ventilo n'arrive pas à refroidir la rampe entre 2 cycles de contrôle de la T°

Materiels
---------
* RaspberryPi3 : http://fr.farnell.com/raspberry-pi/raspberrypi3-modb-1gb/sbc-raspberry-pi-3-mod-b-1gb-ram/dp/2525225?MER=BN-PDP-2525225
* Carte ServoPi : https://www.abelectronics.co.uk/p/44/Servo-PWM-Pi
* Carte 8 relais : http://www.banggood.com/5V-8-Channel-Relay-Module-Board-For-Arduino-PIC-AVR-DSP-ARM-p-74110.html
* Sonde de T° : http://www.banggood.com/DS18B20-Waterproof-Digital-Temperature-Temp-Sensor-Probe-1M-2M-3M-5M-10M-15M-p-983801.html
* Ventilos : http://www.banggood.com/12V-Internal-Desktop-Computer-CPU-Case-Cooling-Cooler-Master-Silent-Fan-7cm-p-997479.html
* Alims réglables : http://www.banggood.com/5Pcs-4V-40V-DC-DC-Step-Down-LM2596-Voltage-Regulator-Converter-Module-p-946548.html

Branchements 
------------
* sondes de T° sur le GPIO4 : 
	http://www.framboise314.fr/mesure-de-temperature-1-wire-ds18b20-avec-le-raspberry-pi/
	http://www.framboise314.fr/wp-content/uploads/2014/02/schema_connexion_600px.jpg

* carte ServoPi :
	https://www.abelectronics.co.uk/p/44/Servo-PWM-Pi
	Chaque Dimmer SureElectronics est connecté sur le pin [-] et le pin [pwm] de la carte sur les Pin 1 à 8
	La carte est alimentée en 5V externe avec le [-] relié aux [-] des Dimmer

* carte 8 Relais :
	Chaque Pwm est relié à un GPIO du Raspberry3 : GPIO11=relais1, GPIO12=relais2, ..., GPIO18=relais8
	La carte relais est alimentée en 5V externe (la même)

* carte IO Pi Plus :
	Je suis tombé sur un bug de la lib ABElectronics, ils l'ont corrigé hier: https://www.abelectronics.co.uk/forums/thread/io-pi-plus-and-servo-pwm-pi-zero-with-nodejs/#lastpost
	TODO: refaire tests avec la carte

* RaspberryPi3 :
	Le raspberry est alimentée en 5V externe (la même) par l'intermédiare de la carte ServoPi

Installation
------------
sudo apt-get install nodejs
mkdir -p ~/projet/maxspect/public/

recopier l'arborescence :
public/
	atten-off.png
	atten-on.png
	fan-off.png
	fan-on.png
	index.html
	off.jpg
	on.jpg
	slider.css
	yle.css

Installation librairie ABElectronics
------------------------------------
cd ~/projet/maxspect
git clone https://github.com/abelectronicsuk/ABElectronics_NodeJS_Libraries.git

Installation modules NodeJS
---------------------------
cd ~/projet/maxspect

npm install express
npm install http
npm install socket.io

npm install ds18x20

npm install rpio
npm install onoff

npm install moment
npm install twix
npm install dateformat

npm install jsonfile
npm install underscore

Execution
---------
cd ~/projet/maxspect
sudo node app.js

appli web : http://<ip rapsberry>:8989