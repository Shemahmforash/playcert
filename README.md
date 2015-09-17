# Playcert
Playcert is a python app that aims in creating spotify playlists based on the concerts around you.

## Installation
In order to use this app, you need to clone it and then install its requirements: `pip install -r requirements.txt`. You will also need to get keys from eventful and echonest and set them in environment variables: 'ECHONEST\_KEY' and 'EVENTFUL\_KEY'.

## Running
You'll need a wsgi server to run the app. The package *waitress* is part of the requirements and you can serve this app with it by running the following at the root of the project:

```
pserve development.ini --reload
```

You can now use the uri /events/{location} in order to obtain a spotify playlist based on the events around your location.