from pyechonest import config, artist as echonest_artist, song as echonest_song
import sys
import os
import logging
import urllib
import requests
import dill
import collections
from functools import wraps


config.ECHO_NEST_API_KEY = os.environ['ECHONEST_KEY']
log = logging.getLogger(__name__)

Song = collections.namedtuple('Song', ['name', 'spotify_id'])


class Artist:

    def __repr__(self):
        return 'Artist(%s, %s)' % (self.name.encode('utf-8'), self.songs)

    def __init__(self, name, redis=None):
        self.songs = []
        self.name = name
        self.redis = None

        # to use cache in this class (not mandatory)
        self.redis = redis

        self.find_songs()

    @staticmethod
    def create_artist_from_text(text, venue, redis=None):
        '''
        Static method that aims in extracting artist name from a text
        and creating an instance of this class based on it
        '''

        # remove venue name from the title of the event
        # it will improve the finding of the artist name from the event title
        if venue:
            text = text.replace(venue, "")

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
            return Artist(artist_name, redis)

        return

    def cache_songs(f):
        '''
        Caches the songs on redis
        '''
        @wraps(f)
        def decorated_function(*args):
            self = args[0]

            if self.redis:
                # try to get songs from cache and set them
                songs = self.redis.hget('artist.songs', self.name)
                songs = dill.loads(songs) if songs else ''

                log.debug('Trying to obtain %s songs from cache', self.name)

                if songs:
                    self.songs = songs
                    log.debug('%s songs obtained from cache', self.name)
                    return

            # find the songs
            f(*args)

            # save them on cache
            if self.songs and self.redis:
                # set songs on cache
                self.redis.hset(
                    'artist.songs', self.name, dill.dumps(self.songs))

                log.debug('%s songs setted in cache', self.name)
        return decorated_function

    @cache_songs
    def find_songs(self):
        '''
        finds songs for this artist
        '''

        # first try in thisdayinmusic.net api
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
            self.songs = [Song(song['name'], song['spotifyId'])
                          for song in artist_info['data']['tracks']['data']]

            return

        # couldn't find artist in thisdayinmusic, trying echonest
        try:
            echonest_songs = echonest_song.search(
                artist=self.name,
                buckets=['id:spotify-WW', 'tracks'],
                limit=True, results=1)

            log.debug('echonest_songs')
            log.debug(echonest_songs)

            if echonest_songs:
                tracks = []
                for s in echonest_songs:
                    t = s.get_tracks('spotify-WW')[0]

                    tracks.append(Song(s.title, t['foreign_id']))

                self.songs = tracks

        except:
            log.error(
                'could not find songs in echonest %s',
                sys.exc_info()[0])
