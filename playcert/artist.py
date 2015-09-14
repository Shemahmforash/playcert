from pyechonest import config, artist as echonest_artist, song as echonest_song
import sys
import os
import logging
import urllib
import requests
import track

config.ECHO_NEST_API_KEY = os.environ['ECHONEST_KEY']
log = logging.getLogger(__name__)


class Artist:

    def __init__(self, name):
        self.songs = []
        self.name = name

        self.find_songs()

    @staticmethod
    def create_artist_from_text(text):
        '''
        Static method that aims in extracting artist name from a text
        and creating an instance of this class based on it
        '''
        try:
            event_artist = echonest_artist.extract(
                text=text, results=1)
        except:
            log.error('could not find artist %s', sys.exc_info()[0])
            return

        log.debug('Event artist from echonest: %s', event_artist)

        artist_name = ''
        if event_artist:
            artist_name = event_artist[0].name

        if artist_name:
            return Artist(artist_name)

        return

    def find_songs(self):
        '''
        finds songs for this artist
        '''
        try:
            artist_uri = urllib.quote(self.name)
        except Exception:
            log.debug('error quoting artist_name')
            return

        uri = "http://api.thisdayinmusic.net/app/api/artists/%s" % artist_uri
        log.debug('uri %s', uri)

        try:
            request = requests.get(uri)
            artist_info = request.json()
        except Exception:
            log.error(
                'could not reach thisdayinmusic api %s', sys.exc_info()[0])
            return

        log.debug('artist_info')
        log.debug(artist_info)

        log.debug('thisdayinmusic artist', artist_info)

        if 'data' in artist_info:
            tracks = []
            for song in artist_info['data']['tracks']['data']:
                tracks.append(track.Track(song['name'], song['spotifyId']))

            self.songs = tracks
        else:
            # couldn't find artist in thisdayinmusic, trying echonest
            try:
                echonest_songs = echonest_song.search(
                    artist=self.name,
                    buckets=['id:spotify-WW', 'tracks'],
                    limit=True, results=1)

                log.debug('echonest_songs')
                log.debug(echonest_songs)

                tracks = []

                if echonest_songs:
                    for s in echonest_songs:
                        t = s.get_tracks('spotify-WW')[0]

                        tracks.append(track.Track(s.title, t['foreign_id']))

                self.songs = tracks
            except:
                log.error(
                    'could not find songs in echonest %s',
                    sys.exc_info()[0])
