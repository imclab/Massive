var jobInfo = {};

var jobs = [
  {
    benchmark: 'box2d-throughput',
    description: 'Box2D physics: average frame rate',
    scale: 'milliseconds (lower numbers are better)',
    args: ['3'],
    createWorker: function() {
      return new Worker('box2d/benchmark-worker.js')
    },
    calculate: function() {
      // output format is:         frame averages: 31.675 +- 7.808, range: 22.000 to 63.000
      var m = /frame averages: (\d+\.\d+) \+- (\d+\.\d+), range: (\d+\.\d+) to (\d+\.\d+)/.exec(this.msg.output);
      jobInfo.box2D = {
        average: parseFloat(m[1]),
        variance: parseFloat(m[2]),
        lowest: parseFloat(m[3]),
        highest: parseFloat(m[4])
      };
      return jobInfo.box2D.average;
    },
    normalized: function() {
      return (20.308/this.calculate());
    },
  },
  {
    benchmark: 'box2d-latency',
    description: 'Box2D physics: frame variability and worst case',
    scale: 'milliseconds (lower numbers are better)',
    createWorker: function() {
      return {
        postMessage: function() {
          this.onmessage({ data: {
            benchmark: 'box2d-latency'
          }});
        }
      };
    },
    calculate: function() {
      return (2*jobInfo.box2D.variance + (jobInfo.box2D.highest - jobInfo.box2D.average))/3;
    },
    normalized: function() {
      return (20.308/this.calculate());
    },
  },
  {
    benchmark: 'box2d-startup',
    description: 'how long it takes Box2D to be ready to run, after it was previously run',
    scale: 'seconds (lower numbers are better)',
    args: ['0'],
    createWorker: function() {
      return new Worker('box2d/benchmark-worker.js')
    },
    calculate: function() {
      return this.msg.runtime/1000;
    },
    normalized: function() {
      return 0.10/Math.max(this.calculate(), 1/60);
    },
  },

  {
    benchmark: 'lua-binarytrees',
    description: 'GC performance in compiled Lua VM',
    scale: 'seconds (lower numbers are better)',
    args: ['binarytrees.lua'],
    createWorker: function() {
      return new Worker('lua/benchmark-worker.js')
    },
    calculate: function() {
      return this.msg.runtime/1000;
    },
    normalized: function() {
      return (20.308/this.calculate());
    },
  },
  {
    benchmark: 'lua-scimark',
    description: 'numeric computation performance in compiled Lua VM',
    scale: 'MFLOPS (higher numbers are better)',
    args: ['scimark.lua'],
    createWorker: function() {
      return new Worker('lua/benchmark-worker.js')
    },
    calculate: function() {
      return parseFloat(/\nSciMark +([\d\.]+)/.exec(this.msg.output)[1]);
    },
    normalized: function() {
      return (this.calculate()/3.19);
    },
  },
  { // do startup last so there is no network access, and can see previous
    benchmark: 'lua-startup',
    description: 'how long it takes the compiled Lua VM to be ready to run, after it was previously run',
    scale: 'seconds (lower numbers are better)',
    args: null,
    createWorker: function() {
      return new Worker('lua/benchmark-worker.js')
    },
    calculate: function() {
      var startups = jobs.map(function(job) { return job.msg.startup });
      startups.sort(function(x, y) { return x - y });
      return startups[Math.floor((startups.length-1)/2)]/1000;
    },
    normalized: function() {
      return 0.10/Math.max(this.calculate(), 1/60); // resolution: 1 frame
    },
  }
];

var ran = false;
function run() {
  if (ran) return;
  ran = true;

  document.getElementById('results_area').hidden = false;

  var tableBody = document.getElementById('table_body');
  tableBody.innerHTML = '';

  var theButton = document.getElementById('the_button');
  theButton.innerHTML = 'Running benchmarks... (this can take a while)';
  theButton.classList.remove('btn-primary');
  theButton.classList.add('btn-warning');

  function finalCalculation() {
    // normalize based on experimental data
    var normalized = jobs.map(function(job) { return 100*job.normalized() });
    console.log('normalized values: ' + normalized);
    return Math.round(normalized.reduce(function(x, y) { return x + y }, 0));
  }

  var curr = 0;
  function runJob() {

    var job = jobs[curr++];
    if (!job) {
      theButton.innerHTML = 'Score: <strong>' + finalCalculation() + '</strong> (higher numbers are better)';
      theButton.classList.remove('btn-warning');
      theButton.classList.add('btn-success');
      return;
    }

    tableBody.innerHTML += '<tr>' +
                           '  <td>' + job.benchmark + '-throughput</td>' +
                           '  <td id="' + job.benchmark + '-cell"><div id="' + job.benchmark + '-output" class="text-center"></div></td>' +
                           '  <td>' + job.scale + '</td>' +
                           '  <td>' + job.description + '</td>' +
                           '</tr>';

    document.getElementById(job.benchmark + '-output').innerHTML = '<b>(..running..)</b>';
    document.getElementById(job.benchmark + '-cell').style = 'background-color: #ffddaa';
    var worker = job.createWorker();
    worker.onmessage = function(event) {
      var msg = event.data;
      console.log(JSON.stringify(msg));
      if (msg.benchmark != job.benchmark) throw 'invalid data from benchmark worker';
      job.msg = msg;
      document.getElementById(job.benchmark + '-output').innerHTML = '<b>' + job.calculate().toFixed(3) + '</b>';
      document.getElementById(job.benchmark + '-cell').style = 'background-color: #bbccff';
      runJob();
    };
    console.log('requesting benchmark ' + job.benchmark);
    worker.postMessage({
      benchmark: job.benchmark,
      args: job.args
    });
  }
  runJob();
}
