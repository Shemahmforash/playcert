from pyechonest import config, artist as echonest_artist, song as echonest_song
import sys
import os
import logging
import urllib
import requests
import redis
import dill
import collections

redisClient = redis.StrictRedis(host='localhost', port=6379, db=0)
config.ECHO_NEST_API_KEY = os.environ['ECHONEST_KEY']
log = logging.getLogger(__name__)

Song = collections.namedtuple('Song', ['name', 'spotify_id'])


class Artist:

    def __repr__(self):
        return 'Artist(%s, %s)' % (self.name.encode('utf-8'), self.songs)

    def __init__(self, name):
        self.songs = []
        self.name = name

        self.find_songs()

    @staticmethod
    def create_artist_from_text(text, venue):
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
            return Artist(artist_name)

        return

    def find_songs(self):
        '''
        finds songs for this artist
        '''

        # try to get songs from cache
        songs = redisClient.hget('artist', self.name)
        songs = dill.loads(songs) if songs else ''
        if songs:
            self.songs = songs
            log.debug('%s songs obtained from cache', self.name)
            return

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

            # set songs on cache
            redisClient.hset('artist', self.name, dill.dumps(self.songs))
        else:
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

                    # set songs on cache
                    redisClient.hset('artist', self.name, dill.dumps(tracks))
            except:
                log.error(
                    'could not find songs in echonest %s',
                    sys.exc_info()[0])
