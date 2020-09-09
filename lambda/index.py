import awsgi
from flask import Flask

app = Flask(__name__)

@app.route("/<path:text>")
def all(text):
    return f"Response inside of a Lambda on path {text}"

def handler(event, context):
    return awsgi.response(app, event, context)