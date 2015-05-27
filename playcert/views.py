from pyramid.view import view_config
import os, eventful, redis, datetime, json
from pyechonest import config, artist, song

config.ECHO_NEST_API_KEY = os.environ['ECHONEST_KEY']
api = eventful.API(os.environ['EVENTFUL_KEY'])
redisClient = redis.StrictRedis(host='localhost', port=6379, db=0)

@view_config(route_name='home', renderer='templates/mytemplate.pt')
def my_view(request):
    return {'project': 'playcert'}

@view_config(route_name='events', renderer='templates/events.pt')
def events_view(request):
    today = datetime.date.today()
    #get events from redis
    events = redisClient.get('events.' + str(today))
    events = json.loads(events) if events else ''
    if not events :
        #or get the events from the eventful api
        events = api.call('/events/search', c='music', l='Lisbon', date='This week')
        events = process_events(events)

        print events

        redisClient.set('events.' + str(today), json.dumps(events))

    return {'events': events['events'], 'songs': events['songs']}

def process_events(events):
    processed = []
    artists = []
    global_songs = []

    for event in events['events']['event']:
        event_processed = {}
        event_processed['title'] = event['title']
        event_processed['venue'] = event['venue_name']
        event_processed['artist'] = ''
        event_processed['songs'] = ''

        #TODO: if no performers from the event, use echonest to get the name of the artist from the event title
        if isinstance(event['performers'], dict):
            event_processed['artist'] = event['performers']['performer']['name']

            songs = redisClient.hget('artist.songs', event_processed['artist'])

            if not songs :
                echonest_songs = song.search(artist=event_processed['artist'], buckets=['id:spotify-WW', 'tracks'], limit=True, results=1)

                simplified_songs = []
                for s in echonest_songs:
                    print 'song: ', s
                    track = s.get_tracks('spotify-WW')[0]
                    print 'track', track
                    simplified_songs.append({'title': s.title, 'foreign_id': track['foreign_id'],} )
                    global_songs.append({'title': s.title, 'foreign_id': track['foreign_id'],} )

                event_processed['songs'] = simplified_songs

                redisClient.hset('artist.songs', event_processed['artist'], simplified_songs)
            else :
                event_processed['songs'] = songs

        processed.append(event_processed)

    return {'events': processed, 'songs': global_songs}

"""
        if isinstance(event['performers'], dict):
            event_processed['artist'] = event['performers']['performer']['name']
            #TODO: find artist from spotify
            #event_processed['artist_info'] = artist.Artist(event_processed['artist'])
            #artist_info = artist.Artist(event_processed['artist'], bucket="id:spotify-WW")

            artist_info = redisClient.hget('artist', event_processed['artist'])
#            artist_info = json.loads(artist_info) if artist_info else ''

            if not artist_info :
                results = artist.search(name=event_processed['artist'], buckets=["id:spotify-WW"])
                artist_info = results[0]
                redisClient.hset('artists', event_processed['artist'], artist_info)
                redisClient.hset('songs', event_processed['artist'], artist_info.songs)

            print artist_info.name, artist_info.id
            print dir(artist_info.songs[0])
            print 'Songs of:' + event_processed['artist'], [song.title for song in artist_info.songs]

            #weezer = weezer_results[0]
            #weezer_blogs = weezer.blogs
            #print 'Blogs about weezer:', [blog.get('url') for blog in weezer_blogs]

            songs = []
            for song in artist_info.songs:
                songs.append({'title': song.title, 'foreign': song.get_foreign_id("spotify-WW")})

            event_processed['songs'] = songs

        processed.append(event_processed)

    return processed
"""
