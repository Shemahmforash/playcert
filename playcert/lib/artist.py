import collections
import logging
import os
import sys
import urllib

from pyechonest import config, artist as echonest_artist, song as echonest_song
from pyechonest.util import EchoNestAPIError, EchoNestIOError
from requests.packages.urllib3.exceptions import ConnectionError
import requests

from playcert.cache import cache_data_in_hash


config.ECHO_NEST_API_KEY = os.environ['ECHONEST_KEY']

log = logging.getLogger(__name__)

Song = collections.namedtuple('Song', ['name', 'spotify_id'])


class Artist(object):

    def __repr__(self):
        return 'Artist(%s, %s)' % (self.name.encode('utf-8'), self.songs)

    def __init__(self, name, redis=None):
        self.songs = []
        self.name = name

        # to use cache in this class (not mandatory)
        self.redis = redis

        self.songs = self.find_songs()

    @staticmethod
    def create_artist_from_text(text, venue, redis=None):
        """
        Static method that aims in extracting artist name from a text
        and creating an instance of this class based on it
        """

        # remove venue name from the title of the event
        # it will improve the finding of the artist name from the event title
        if venue:
            text = text.replace(venue, '')

        try:
            event_artist = echonest_artist.extract(text=text, results=1)
        except (EchoNestAPIError, EchoNestIOError):
            log.error('could not find artist %s', sys.exc_info()[0])
            return

        log.debug('Event artist from echonest: %s', event_artist)

        artist_name = ''
        if event_artist:
            artist_name = event_artist[0].name

        if artist_name:
            return Artist(artist_name, redis)

        return

    def cache_hash_key(self):
        return 'artist.songs'

    def cache_key(self):
        return self.name

    @cache_data_in_hash
    def find_songs(self):
        """
        Finds songs for this artist in thisdayinmusic api or echonest api
        """

        # first try in thisdayinmusic.net api
        try:
            artist_uri = urllib.quote(self.name)
        except (ValueError, KeyError):
            log.debug('error quoting artist_name')
            return

        if artist_uri:
            uri = "http://api.thisdayinmusic.net/app/api/artists/%s" % artist_uri
            log.debug('uri %s', uri)

            try:
                request = requests.get(uri)
            except ConnectionError:
                log.error(
                    'could not reach thisdayinmusic api %s', sys.exc_info()[0])
                return

            artist_info = request.json()

            log.debug('artist_info')
            log.debug(artist_info)

            log.debug('thisdayinmusic artist', artist_info)

            if 'data' in artist_info:
                return [
                    Song(song['name'], song['spotifyId'])
                    for song in artist_info['data']['tracks']['data']
                ]

        # couldn't find artist in thisdayinmusic, trying echonest
        try:
            echonest_songs = echonest_song.search(
                artist=self.name,
                buckets=['id:spotify-WW', 'tracks'],
                limit=True, results=1)
        except (EchoNestAPIError, EchoNestIOError):
            log.error('could not find songs in echonest %s', sys.exc_info()[0])
        else:
            log.debug('echonest_songs')
            log.debug(echonest_songs)

            if echonest_songs:
                tracks = []
                for song in echonest_songs:
                    try:
                        track = song.get_tracks('spotify-WW')[0]
                    except (EchoNestAPIError, EchoNestIOError):
                        log.error(
                            'could not find song details in echonest %s',
                            sys.exc_info()[0]
                        )
                    else:
                        tracks.append(Song(song.title, track['foreign_id']))

                return tracks
